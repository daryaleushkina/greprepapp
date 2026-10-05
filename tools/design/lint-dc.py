"""Быстрая проверка .dc.html без рендера: закрытые теги, строка support.js,
валидный data-props, запрещённые символы-иконки и эмодзи."""
import json, re, sys
from html.parser import HTMLParser

# Элементы SVG не пустые в HTML: <path> без «/>» вкладывает соседей внутрь себя.
VOID = {'area','base','br','col','embed','hr','img','input','link','meta','source','track','wbr'}
ICON_GLYPHS = '✓✔✕✗✘★☆→←↑↓⋯›‹▶◀●○◉⚑⏱'


class P(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack, self.errors = [], []

    def handle_starttag(self, tag, attrs):
        if tag not in VOID:
            self.stack.append((tag, self.getpos()))

    def handle_startendtag(self, tag, attrs):
        pass

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if not self.stack:
            self.errors.append(f'лишний </{tag}> {self.getpos()}')
            return
        if self.stack[-1][0] == tag:
            self.stack.pop()
            return
        names = [t for t, _ in self.stack]
        if tag in names:
            while self.stack and self.stack[-1][0] != tag:
                t, pos = self.stack.pop()
                self.errors.append(f'не закрыт <{t}> {pos}')
            self.stack.pop()
        else:
            self.errors.append(f'лишний </{tag}> {self.getpos()}')


def check(path):
    s = open(path, encoding='utf-8').read()
    out = []
    if '<script src="./support.js"></script>' not in s:
        out.append('нет строки support.js')
    m = re.search(r"data-props='([^']*)'", s)
    if not m:
        out.append('нет data-props')
    else:
        try:
            json.loads(m.group(1).replace('&amp;', '&').replace('&#39;', "'"))
        except Exception as e:
            out.append(f'data-props не JSON: {e}')
    if 'class Component extends DCLogic' not in s:
        out.append('нет class Component')
    body = s.split('<script type="text/x-dc"')[0]
    # SVG-текст и стили не считаем: ищем глифы только в видимом тексте
    text = re.sub(r'<[^>]+>', ' ', body)
    bad = sorted({c for c in text if c in ICON_GLYPHS or ord(c) >= 0x1F300})
    if bad:
        out.append('символы вместо иконок: ' + ' '.join(bad))
    p = P()
    p.feed(body)
    out += p.errors
    for t, pos in p.stack:
        if t not in ('html', 'body', 'head'):
            out.append(f'не закрыт <{t}> {pos}')
    return out


if __name__ == '__main__':
    bad = 0
    for f in sys.argv[1:]:
        r = check(f)
        if r:
            bad += 1
            print(f.split('/')[-1], '\n  ' + '\n  '.join(r[:12]))
        else:
            print(f.split('/')[-1], 'ok')
    sys.exit(1 if bad else 0)
