package httpx

import (
	"encoding/json"
	"net/http"
)

// errorBody — тело ошибки по договору (api/openapi.yaml, Error). Для ответов вне сгенерированного
// сервера: паника, неизвестный путь, отказ по частоте или чужому сайту.
type errorBody struct {
	Code      string `json:"code"`
	Message   string `json:"message"`
	RequestID string `json:"requestId"`
}

// WriteError пишет ошибку в формате договора.
func WriteError(w http.ResponseWriter, r *http.Request, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	body := errorBody{Code: code, Message: message, RequestID: FromContext(r.Context()).ID}
	if err := json.NewEncoder(w).Encode(body); err != nil {
		// Клиент ушёл посреди ответа: статус уже отправлен, сделать больше нечего.
		return
	}
}
