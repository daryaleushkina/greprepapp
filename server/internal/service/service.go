// Package service — обработчики API: реализация интерфейсов, сгенерированных ogen по договору
// (api.Handler и api.SecurityHandler).
package service

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/ogen-go/ogen/ogenerrors"

	"github.com/daryaleushkina/greprepapp/server/internal/api"
	"github.com/daryaleushkina/greprepapp/server/internal/apperr"
	"github.com/daryaleushkina/greprepapp/server/internal/auth"
	"github.com/daryaleushkina/greprepapp/server/internal/config"
	"github.com/daryaleushkina/greprepapp/server/internal/db"
	"github.com/daryaleushkina/greprepapp/server/internal/httpx"
	"github.com/daryaleushkina/greprepapp/server/internal/today"
)

// CookieName — кука сессии сайта и админки. Приставка __Host- требует Secure, Path=/ и запрещает Domain:
// куку нельзя подложить с поддомена (OWASP Session Management Cheat Sheet).
const CookieName = "__Host-session"

// touchEvery — как часто продлевать срок простоя сессии. Не на каждый запрос: иначе каждый запрос — запись.
const touchEvery = time.Hour

// dbTimeout — срок любого запроса к базе из обработчика.
const dbTimeout = 5 * time.Second

// Service — все обработчики API.
type Service struct {
	cfg  config.Config
	pool *pgxpool.Pool
	q    *db.Queries
	oidc *auth.OIDC
	log  *slog.Logger
	now  func() time.Time
}

var (
	_ api.Handler         = (*Service)(nil)
	_ api.SecurityHandler = (*Service)(nil)
)

// New — обработчики поверх пула соединений. now — часы (в тестах подменяются).
func New(cfg config.Config, pool *pgxpool.Pool, oidc *auth.OIDC, log *slog.Logger, now func() time.Time) *Service {
	if now == nil {
		now = time.Now
	}
	return &Service{cfg: cfg, pool: pool, q: db.New(pool), oidc: oidc, log: log, now: now}
}

// principal — кто вошёл в этом запросе.
type principal struct {
	user      db.User
	tokenHash []byte
}

type principalKey struct{}

func principalFrom(ctx context.Context) (principal, error) {
	p, ok := ctx.Value(principalKey{}).(principal)
	if !ok {
		return principal{}, apperr.Unauthenticated(errors.New("no principal in context"))
	}
	return p, nil
}

// HandleBearerAuth — токен из заголовка Authorization (мини-апп, приложения).
func (s *Service) HandleBearerAuth(ctx context.Context, op api.OperationName, t api.BearerAuth) (context.Context, error) {
	return s.authenticate(ctx, op, t.Token)
}

// HandleCookieAuth — токен из куки __Host-session (сайт, админка).
func (s *Service) HandleCookieAuth(ctx context.Context, op api.OperationName, t api.CookieAuth) (context.Context, error) {
	return s.authenticate(ctx, op, t.APIKey)
}

func (s *Service) authenticate(ctx context.Context, op api.OperationName, token string) (context.Context, error) {
	// Ошибку клиента принимаем и без входа: протухший токен не должен глушить отчёт о сбое.
	optional := op == api.ReportClientErrorOperation
	fail := func(err error) (context.Context, error) {
		if optional {
			return ctx, ogenerrors.ErrSkipServerSecurity
		}
		return ctx, apperr.Unauthenticated(err)
	}
	hash, err := auth.ParseSessionToken(token)
	if err != nil {
		return fail(err)
	}
	qctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()
	row, err := s.q.GetLiveSession(qctx, hash)
	if errors.Is(err, pgx.ErrNoRows) {
		return fail(errors.New("session not found or expired"))
	}
	if err != nil {
		return ctx, fmt.Errorf("load session: %w", err)
	}
	now := s.now()
	if now.Sub(row.LastSeenAt) > touchEvery {
		err := s.q.TouchSession(qctx, db.TouchSessionParams{IdleExpiresAt: now.Add(s.cfg.SessionIdle), TokenHash: hash})
		if err != nil {
			return ctx, fmt.Errorf("touch session: %w", err)
		}
	}
	user := db.User{ID: row.ID, Name: row.Name, Role: row.Role, Locale: row.Locale, CreatedAt: row.CreatedAt}
	httpx.FromContext(ctx).SetUser(user.ID.String())
	return context.WithValue(ctx, principalKey{}, principal{user: user, tokenHash: hash}), nil
}

// GetHealth — сервер жив и база отвечает.
func (s *Service) GetHealth(ctx context.Context) (*api.Health, error) {
	pctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	if err := s.pool.Ping(pctx); err != nil {
		return nil, apperr.New(http.StatusServiceUnavailable, apperr.Internal, "database unavailable", err)
	}
	return &api.Health{Status: api.HealthStatusOk, Version: s.cfg.Version}, nil
}

// SignInWithTelegramMiniApp — вход из мини-аппа по initData; токен — в теле, мини-апп держит его в памяти.
func (s *Service) SignInWithTelegramMiniApp(ctx context.Context, req *api.TelegramMiniAppSignIn) (*api.Session, error) {
	data, err := auth.VerifyInitData(req.InitData, s.cfg.BotToken, s.cfg.InitDataMaxAge, s.now())
	if err != nil {
		return nil, apperr.New(http.StatusUnauthorized, apperr.InvalidInitData, "init data rejected", err)
	}
	id := auth.Identity{Provider: "telegram", Subject: fmt.Sprint(data.User.ID), Name: data.User.DisplayName()}
	res, err := s.signIn(ctx, signInRequest{
		identity:   id,
		locale:     auth.Locale(data.User.LanguageCode),
		transport:  api.SessionTransportBearer,
		clientKind: api.ClientKindTelegram,
	})
	if err != nil {
		return nil, err
	}
	return &res.Response, nil
}

// SignInWithIdToken — вход по id_token, полученному на устройстве.
func (s *Service) SignInWithIdToken(ctx context.Context, req *api.IdTokenSignIn) (*api.SessionHeaders, error) {
	id, err := s.oidc.VerifyIDToken(ctx, string(req.Provider), req.IdToken, req.Nonce)
	if err != nil {
		return nil, oidcError(err)
	}
	if id.Name == "" {
		id.Name = req.DisplayName.Or("")
	}
	return s.signIn(ctx, signInRequest{
		identity:   id,
		locale:     clientLocale(req.Locale),
		transport:  req.Transport,
		clientKind: req.ClientKind.Or(defaultClientKind(req.Transport)),
	})
}

// SignInWithAuthorizationCode — вход по коду авторизации: обмен на сервере, секрет на устройство не уходит.
func (s *Service) SignInWithAuthorizationCode(ctx context.Context, req *api.AuthorizationCodeSignIn) (*api.SessionHeaders, error) {
	id, err := s.oidc.ExchangeCode(ctx, string(req.Provider), req.Code, req.CodeVerifier, req.RedirectUri, req.Nonce.Or(""))
	if err != nil {
		return nil, oidcError(err)
	}
	return s.signIn(ctx, signInRequest{
		identity:   id,
		locale:     clientLocale(req.Locale),
		transport:  req.Transport,
		clientKind: req.ClientKind.Or(defaultClientKind(req.Transport)),
	})
}

// SignInForDevelopment — вход подменой. В бою выключен (config запрещает DEV_AUTH с production), и
// путь отвечает 404, как будто его нет.
func (s *Service) SignInForDevelopment(ctx context.Context, req *api.DevSignIn) (*api.SessionHeaders, error) {
	if !s.cfg.DevAuth || s.cfg.Env == config.EnvProduction {
		return nil, apperr.New(http.StatusNotFound, apperr.NotFound, "not found", nil)
	}
	return s.signIn(ctx, signInRequest{
		identity:   auth.Identity{Provider: "dev", Subject: req.Name, Name: req.Name},
		locale:     clientLocale(req.Locale),
		role:       string(req.Role.Or(api.RoleUser)),
		transport:  req.Transport,
		clientKind: req.ClientKind.Or(defaultClientKind(req.Transport)),
	})
}

// clientLocale — язык нового аккаунта вне мини-аппа: тот, что клиент выбрал по языку устройства. Нет
// поля — русский: аудитория русскоязычная (PRODUCT.md, «Users»).
func clientLocale(l api.OptLocale) string {
	return string(l.Or(api.LocaleRu))
}

func defaultClientKind(t api.SessionTransport) api.ClientKind {
	if t == api.SessionTransportCookie {
		return api.ClientKindWeb
	}
	return api.ClientKindIos
}

func oidcError(err error) error {
	switch {
	case errors.Is(err, auth.ErrProviderUnavailable):
		return apperr.New(http.StatusServiceUnavailable, apperr.ProviderUnavailable, "identity provider unavailable", err)
	case errors.Is(err, auth.ErrRedirectNotAllowed):
		return apperr.Invalid("redirect uri not allowed", err)
	default:
		return apperr.New(http.StatusUnauthorized, apperr.InvalidIDToken, "id token rejected", err)
	}
}

type signInRequest struct {
	identity   auth.Identity
	locale     string
	role       string // только для входа подменой; пусто — не трогать
	transport  api.SessionTransport
	clientKind api.ClientKind
}

// signIn находит или заводит аккаунт по способу входа и открывает сессию. Новый способ входа сам к
// существующему аккаунту не прирастает: привязка — только из настроек, когда человек уже вошёл
// (PRODUCT.md, «Stack», решение Даши 06.10.2026).
func (s *Service) signIn(ctx context.Context, r signInRequest) (*api.SessionHeaders, error) {
	tctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()

	user, err := s.findOrCreateUser(tctx, r)
	if err != nil {
		return nil, err
	}
	now := s.now()
	token, hash := auth.NewSessionToken()
	idle := now.Add(s.cfg.SessionIdle)
	absolute := now.Add(s.cfg.SessionAbsolute)
	err = s.q.CreateSession(tctx, db.CreateSessionParams{
		TokenHash:         hash,
		UserID:            user.ID,
		ClientKind:        string(r.clientKind),
		IdleExpiresAt:     idle,
		AbsoluteExpiresAt: absolute,
	})
	if err != nil {
		return nil, fmt.Errorf("create session: %w", err)
	}
	httpx.FromContext(ctx).SetUser(user.ID.String())

	apiUser, err := s.apiUser(tctx, user)
	if err != nil {
		return nil, err
	}
	res := &api.SessionHeaders{Response: api.Session{ExpiresAt: idle, User: apiUser}}
	if r.transport == api.SessionTransportCookie {
		res.SetCookie = api.NewOptString(sessionCookie(token, absolute.Sub(now)).String())
	} else {
		res.Response.Token = api.NewOptString(token)
	}
	return res, nil
}

func (s *Service) findOrCreateUser(ctx context.Context, r signInRequest) (db.User, error) {
	// Две попытки: если два первых входа одного человека пришли одновременно, второй упрётся в
	// уникальность способа входа — тогда аккаунт уже есть, и его надо просто прочитать.
	for range 2 {
		user, err := s.q.GetUserByIdentity(ctx, db.GetUserByIdentityParams{Provider: r.identity.Provider, Subject: r.identity.Subject})
		if err == nil {
			if r.role != "" && r.role != user.Role {
				if err := s.q.SetUserRole(ctx, db.SetUserRoleParams{ID: user.ID, Role: r.role}); err != nil {
					return db.User{}, fmt.Errorf("set dev role: %w", err)
				}
				user.Role = r.role
			}
			return user, nil
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return db.User{}, fmt.Errorf("find user by identity: %w", err)
		}
		user, err = s.createUser(ctx, r)
		if isUniqueViolation(err) {
			continue
		}
		return user, err
	}
	return db.User{}, errors.New("find or create user: identity raced twice")
}

func (s *Service) createUser(ctx context.Context, r signInRequest) (db.User, error) {
	var user db.User
	err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		q := s.q.WithTx(tx)
		name := r.identity.Name
		if name == "" {
			name = providerTitle(r.identity.Provider)
		}
		role := r.role
		if role == "" {
			role = string(api.RoleUser)
		}
		var err error
		user, err = q.CreateUser(ctx, db.CreateUserParams{Name: name, Role: role, Locale: r.locale})
		if err != nil {
			return fmt.Errorf("create user: %w", err)
		}
		err = q.CreateIdentity(ctx, db.CreateIdentityParams{Provider: r.identity.Provider, Subject: r.identity.Subject, UserID: user.ID})
		if err != nil {
			return fmt.Errorf("create identity: %w", err)
		}
		return nil
	})
	if err != nil {
		return db.User{}, fmt.Errorf("create user with identity: %w", err)
	}
	return user, nil
}

func providerTitle(provider string) string {
	switch provider {
	case "apple":
		return "Apple"
	case "google":
		return "Google"
	default:
		return "Telegram"
	}
}

func isUniqueViolation(err error) bool {
	var pg *pgconn.PgError
	return errors.As(err, &pg) && pg.Code == "23505"
}

func sessionCookie(token string, maxAge time.Duration) *http.Cookie {
	return &http.Cookie{
		Name:     CookieName,
		Value:    token,
		Path:     "/",
		MaxAge:   int(maxAge.Seconds()),
		Secure:   true,
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
	}
}

// expiredSessionCookie стирает куку сессии в браузере (Max-Age=0 в заголовке).
func expiredSessionCookie() *http.Cookie {
	return &http.Cookie{
		Name:     CookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		Secure:   true,
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
	}
}

func (s *Service) apiUser(ctx context.Context, u db.User) (api.User, error) {
	ids, err := s.q.ListIdentities(ctx, u.ID)
	if err != nil {
		return api.User{}, fmt.Errorf("list identities: %w", err)
	}
	linked := make([]api.LinkedIdentity, 0, len(ids))
	for _, id := range ids {
		linked = append(linked, api.LinkedIdentity{Provider: api.IdentityProvider(id.Provider), LinkedAt: id.CreatedAt})
	}
	return api.User{
		ID:         u.ID,
		Name:       u.Name,
		Role:       api.Role(u.Role),
		Locale:     api.Locale(u.Locale),
		Identities: linked,
	}, nil
}

// SignOut удаляет сессию сразу; на сайте ещё и стирает куку.
func (s *Service) SignOut(ctx context.Context) (*api.SignOutNoContent, error) {
	p, err := principalFrom(ctx)
	if err != nil {
		return nil, err
	}
	qctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()
	if err := s.q.DeleteSession(qctx, p.tokenHash); err != nil {
		return nil, fmt.Errorf("delete session: %w", err)
	}
	return &api.SignOutNoContent{SetCookie: api.NewOptString(expiredSessionCookie().String())}, nil
}

// GetMe — кто вошёл.
func (s *Service) GetMe(ctx context.Context) (*api.User, error) {
	p, err := principalFrom(ctx)
	if err != nil {
		return nil, err
	}
	qctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()
	u, err := s.apiUser(qctx, p.user)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

// GetToday — лента шагов на сегодня.
func (s *Service) GetToday(ctx context.Context) (*api.Today, error) {
	p, err := principalFrom(ctx)
	if err != nil {
		return nil, err
	}
	plan := today.ForNewUser(s.now(), p.user.Locale)
	steps := make([]api.TodayStep, 0, len(plan.Steps))
	for _, st := range plan.Steps {
		steps = append(steps, api.TodayStep{
			ID:      st.ID,
			Section: api.Section(st.Section),
			Title:   st.Title,
			Minutes: st.Minutes,
			State:   api.StepState(st.State),
		})
	}
	return &api.Today{Date: plan.Date, Steps: steps}, nil
}

// ReportClientError — ошибка на клиенте; можно и без входа.
func (s *Service) ReportClientError(ctx context.Context, req *api.ClientError) error {
	var userID *uuid.UUID
	if p, err := principalFrom(ctx); err == nil {
		userID = &p.user.ID
	}
	qctx, cancel := context.WithTimeout(ctx, dbTimeout)
	defer cancel()
	err := s.q.InsertClientError(qctx, db.InsertClientErrorParams{
		UserID:     userID,
		RequestID:  optPtr(req.RequestId),
		Message:    req.Message,
		Stack:      optPtr(req.Stack),
		Route:      optPtr(req.Route),
		ClientKind: string(req.ClientKind),
		AppVersion: req.AppVersion,
		OccurredAt: req.OccurredAt,
	})
	if err != nil {
		return fmt.Errorf("insert client error: %w", err)
	}
	return nil
}

func optPtr(o api.OptString) *string {
	if v, ok := o.Get(); ok {
		return &v
	}
	return nil
}

// GetReviewQueue — очередь контента на проверку; только для роли admin.
func (s *Service) GetReviewQueue(ctx context.Context) (*api.ReviewQueue, error) {
	p, err := principalFrom(ctx)
	if err != nil {
		return nil, err
	}
	if p.user.Role != string(api.RoleAdmin) {
		return nil, apperr.Denied("admin only")
	}
	return &api.ReviewQueue{Items: []api.ReviewItem{}}, nil
}

// NewError — тело и статус для любой ошибки обработчика или проверки входа.
func (s *Service) NewError(ctx context.Context, err error) *api.ErrorStatusCode {
	status, code, message := classify(err)
	reqID := httpx.FromContext(ctx).ID
	if status >= http.StatusInternalServerError {
		s.log.LogAttrs(ctx, slog.LevelError, "handler error", slog.String("request_id", reqID), slog.String("error", err.Error()))
	} else {
		s.log.LogAttrs(ctx, slog.LevelInfo, "client error", slog.String("request_id", reqID), slog.String("code", string(code)), slog.String("error", err.Error()))
	}
	return &api.ErrorStatusCode{StatusCode: status, Response: api.Error{Code: string(code), Message: message, RequestId: reqID}}
}

// classify — статус, код и безопасный текст. Внутренние ошибки наружу не описываются.
func classify(err error) (int, apperr.Code, string) {
	if e, ok := apperr.As(err); ok {
		return e.Status, e.Code, e.Message
	}
	switch ogenerrors.ErrorCode(err) {
	case http.StatusBadRequest:
		return http.StatusBadRequest, apperr.BadRequest, err.Error()
	case http.StatusUnauthorized, http.StatusForbidden:
		return http.StatusUnauthorized, apperr.Unauthorized, "sign in required"
	case http.StatusNotFound:
		return http.StatusNotFound, apperr.NotFound, "not found"
	}
	if _, ok := errors.AsType[*ogenerrors.SecurityError](err); ok {
		return http.StatusUnauthorized, apperr.Unauthorized, "sign in required"
	}
	return http.StatusInternalServerError, apperr.Internal, "internal error"
}

// ErrorHandler — ошибки, которые ogen ловит до обработчика (тело не разобралось, лишнее поле, неверное
// значение): 400 с кодом в формате договора, а не 500.
func (s *Service) ErrorHandler(ctx context.Context, w http.ResponseWriter, r *http.Request, err error) {
	e := s.NewError(ctx, err)
	httpx.WriteError(w, r, e.StatusCode, e.Response.Code, e.Response.Message)
}
