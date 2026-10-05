#!/usr/bin/env python3
"""Логотипы входа (scripts/logos/*.svg — файлы компаний) → фигуры SwiftUI в GrePrep/Design/SignInLogos.swift.

Зачем: система растрирует SVG из каталога по-разному от запуска к запуску (то чётко, то мыльно), и снимки
экранов расходились. Path в коде рисуется одинаково и в любом масштабе. Запуск после замены файла:
  python3 scripts/svg2swift.py
"""
import re
import subprocess
import xml.etree.ElementTree as ET
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
LOGOS = HERE / "scripts/logos"
OUT = HERE / "GrePrep/Design/SignInLogos.swift"


def tokens(d):
    for m in re.finditer(r"[MmLlHhVvCcSsZz]|-?(?:\d+\.\d*|\.\d+|\d+)(?:e-?\d+)?", d):
        yield m.group(0)


def to_swift(d):
    """Команды path → вызовы Path. Поддержано то, что есть в логотипах: M L H V C S Z (и строчные)."""
    out, it = [], list(tokens(d))
    i, cmd = 0, None
    x = y = sx = sy = 0.0
    last_c2 = None

    def num():
        nonlocal i
        v = float(it[i])
        i += 1
        return v

    def pt(a, b):
        return f"CGPoint(x: {a:.4g}, y: {b:.4g})"

    while i < len(it):
        if re.match(r"[A-Za-z]", it[i]):
            cmd = it[i]
            i += 1
            if cmd in "Zz":
                out.append("p.closeSubpath()")
                x, y = sx, sy
                last_c2 = None
                continue
        rel = cmd.islower()
        c = cmd.upper()
        if c == "M":
            nx, ny = num(), num()
            x, y = (x + nx, y + ny) if rel else (nx, ny)
            sx, sy = x, y
            out.append(f"p.move(to: {pt(x, y)})")
            cmd = "l" if rel else "L"  # следующие пары после M — это L
            last_c2 = None
        elif c == "L":
            nx, ny = num(), num()
            x, y = (x + nx, y + ny) if rel else (nx, ny)
            out.append(f"p.addLine(to: {pt(x, y)})")
            last_c2 = None
        elif c == "H":
            nx = num()
            x = x + nx if rel else nx
            out.append(f"p.addLine(to: {pt(x, y)})")
            last_c2 = None
        elif c == "V":
            ny = num()
            y = y + ny if rel else ny
            out.append(f"p.addLine(to: {pt(x, y)})")
            last_c2 = None
        elif c in "CS":
            if c == "C":
                x1, y1 = num(), num()
                if rel:
                    x1, y1 = x + x1, y + y1
            else:
                x1, y1 = (2 * x - last_c2[0], 2 * y - last_c2[1]) if last_c2 else (x, y)
            x2, y2, ex, ey = num(), num(), num(), num()
            if rel:
                x2, y2, ex, ey = x + x2, y + y2, x + ex, y + ey
            out.append(f"p.addCurve(to: {pt(ex, ey)}, control1: {pt(x1, y1)}, control2: {pt(x2, y2)})")
            last_c2 = (x2, y2)
            x, y = ex, ey
        else:
            raise SystemExit(f"svg2swift: команда {cmd} не поддержана")
    return out


def shape(name, viewbox, d, doc):
    w, h = viewbox
    body = "\n".join(" " * 12 + line for line in to_swift(d))
    return f'''/// {doc}
struct {name}: Shape {{
    func path(in rect: CGRect) -> Path {{
        let scale = min(rect.width / {w:g}, rect.height / {h:g})
        let path = Path {{ p in
{body}
        }}
        return path.applying(CGAffineTransform(scaleX: scale, y: scale).translatedBy(x: rect.minX / scale, y: rect.minY / scale))
    }}
}}
'''


def svg(name):
    root = ET.parse(LOGOS / name).getroot()
    ns = "{http://www.w3.org/2000/svg}"
    vb = [float(v) for v in root.get("viewBox").split()][2:]
    return vb, [(p.get("d"), p.get("fill")) for p in root.iter(f"{ns}path")]


tg_vb, tg_paths = svg("telegram-logo.svg")
g_vb, g_paths = svg("google-g.svg")
parts = [
    "// Сгенерировано scripts/svg2swift.py из scripts/logos/*.svg — руками не править.",
    "import SwiftUI",
    "",
    shape("TelegramLogoShape", tg_vb, tg_paths[0][0], "Бумажный самолётик Telegram (официальный логотип), красится цветом переднего плана."),
]
colors = {"#EA4335": "red", "#4285F4": "blue", "#FBBC05": "yellow", "#34A853": "green"}
for d, fill in g_paths:
    parts.append(shape(f"GoogleG{colors[fill].capitalize()}", g_vb, d, f"Часть «G» Google, цвет {colors[fill]}."))
parts.append('''/// Цветная «G» Google — цвета самой Google, не наши токены (правила Google Identity).
struct GoogleGLogo: View {
    var body: some View {
        ZStack {
            GoogleGRed().fill(Color(red: 0xEA / 255, green: 0x43 / 255, blue: 0x35 / 255))
            GoogleGBlue().fill(Color(red: 0x42 / 255, green: 0x85 / 255, blue: 0xF4 / 255))
            GoogleGYellow().fill(Color(red: 0xFB / 255, green: 0xBC / 255, blue: 0x05 / 255))
            GoogleGGreen().fill(Color(red: 0x34 / 255, green: 0xA8 / 255, blue: 0x53 / 255))
        }
    }
}
''')
OUT.write_text("\n".join(parts))
# Тот же вид, что у остального кода (гейт проверяет swift format lint).
subprocess.run(["swift", "format", "format", "-i", "--configuration", str(HERE / ".swift-format"), str(OUT)], check=True)
print(f"svg2swift: {OUT.relative_to(HERE)}")
