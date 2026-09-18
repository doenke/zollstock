# Prüfstrecke

Zollstock bringt eine eigene Prüfstrecke mit. Sie gehört nicht zur App – für
den Betrieb braucht es sie nicht, sie liegt nur dabei, damit sich Änderungen
nachrechnen lassen, statt sie zu glauben.

```bash
cd tests
npm install
npm test
```

Geprüft wird, was sich nachrechnen lässt: die lichten Weiten der Schlitze, die
Maße der Sechskante und Halbkreise, wo die Null im Lineal sitzt, die
Umrechnungen des Winkelmessers, ob die Messfläche bis an die Bildschirmkante
reicht, ob Gemerktes ein Neuladen übersteht. 58 Behauptungen in sechzehn
Prüfungen; ein Teilwort als Argument läuft nur die passenden
(`npm test lehre`).

## Wie gemessen wird

Gemessen wird in den Bildpunkten der Zeichenfläche – über die Schwerpunkte der
gezeichneten Striche, weil die gegen Kantenglättung unempfindlich sind. Der
Maßstab wird dafür fest auf 5,5 px/mm gesetzt, damit die Erwartungswerte nicht
am erkannten Gerät hängen.

Jede Prüfung bekommt einen frischen Browser-Kontext. Lagesensor,
Bildschirmdrehung und `localStorage` werden vor dem Laden gesetzt, damit die
App unter bekannten Bedingungen startet.

## Was dazugehört

```
tests/package.json      playwright-core als einzige Abhängigkeit
tests/lib.js            Webserver, Browsersuche, Behauptungen
tests/checks.js         die Prüfungen selbst
tests/run.js            Ablauf, Kontexte, Vorbelegung
```

Die Prüfstrecke braucht `playwright-core` und einen Chromium. Ihre
`package.json` liegt in `tests/`, damit das Projekt selbst ohne Build und ohne
Abhängigkeiten bleibt. Gefunden wird der Browser über `CHROME_PATH`, über
`PLAYWRIGHT_BROWSERS_PATH` oder an den üblichen Orten; sonst hilft
`npx playwright install chromium`.

## Was sie nicht kann

Sie sieht nicht, dass „Nicht stören“ das Vibrieren abwürgt, ob die Pixeldichte
für dieses Display stimmt oder ob ein Bohrer wirklich in den Schlitz passt.
Sie prüft Rechnung und Anordnung, nicht die Physik – das Handy bleibt die
letzte Instanz.
