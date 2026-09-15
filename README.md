# Zollstock

Statische PWA zum Messen: zeigt ein **Lineal in Originalgröße** auf dem Display –
Zentimeter- und Zollskala – und enthält einen **Winkelmesser** (derzeit Vorschau).

Kein Build, keine Abhängigkeiten, offline nutzbar.

## Wie die Originalgröße zustande kommt

Browser geben die physische Pixeldichte nicht direkt preis. Verfügbar sind nur:

| Wert | Bedeutung |
| --- | --- |
| `screen.width` / `screen.height` | logische Auflösung in CSS-Pixeln |
| `devicePixelRatio` | Verhältnis physischer zu logischen Pixeln |

Daraus errechnet die App die physische Auflösung und schlägt sie in einer
Gerätetabelle nach (`js/devices.js`). Trifft sie zu, steht die echte Pixeldichte
fest:

```
physische Pixel     = CSS-Pixel × devicePixelRatio
CSS-Pixel pro Zoll  = ppi ÷ devicePixelRatio
CSS-Pixel pro mm    = ppi ÷ devicePixelRatio ÷ 25,4
```

Ohne Treffer greift die Konvention der Plattform (Mobilgeräte ≈ 160 dpi,
Desktop = 96 dpi) – das ist nur eine Näherung, deshalb weist die App dann auf
die Kalibrierung hin.

### Kalibrierung

Drei Wege, alle unter dem Zahnrad oben rechts:

1. **EC-/Kreditkarte** – genormt 85,6 × 54,0 mm (ISO/IEC 7810 ID-1). Karte auflegen,
   Umriss im Vollbild anpassen. Genaueste Methode.
2. **Linie messen** – eine Referenzlinie mit einem echten Lineal messen und die
   Länge in Millimetern eintragen.
3. **PPI eingeben** – Herstellerangabe zur Pixeldichte direkt eintragen.

Das Ergebnis liegt in `localStorage` (`zollstock.calibration.v1`) und gilt für
dieses Gerät, bis es über „Automatik“ zurückgesetzt wird.

### Genauigkeit

Die Nulllinie liegt am Rand des **sichtbaren Bereichs**, nicht am Gehäuserand.
Im Browser verschiebt die Adressleiste diesen Rand. Für randgenaues Messen die
App zum Startbildschirm hinzufügen – als installierte PWA läuft sie im Vollbild.

## Bedienung

| Element | Funktion |
| --- | --- |
| Tippen / Ziehen auf der Skala | Messmarke setzen, Anzeige in cm, mm, Zoll (dezimal und als Bruch) |
| ⟨\|⟩ | Skala auf die andere Kante spiegeln |
| cm+in | Zollskala ein- und ausblenden |
| ⚙ | Kalibrierung |
| Lineal / Winkel | Ansicht wechseln |

Das Lineal läuft immer entlang der längeren Bildschirmkante und folgt der
Geräteausrichtung. Während des Messens hält die App den Bildschirm wach
(Wake-Lock, sofern vom Browser unterstützt).

## Aufbau

```
index.html              Gerüst beider Ansichten
css/style.css           Darstellung
js/devices.js           Bildschirmerkennung, Gerätetabelle
js/calibration.js       Kalibrierung inkl. Vollbild-Kartenabgleich
js/ruler.js             Lineal (Canvas)
js/protractor.js        Winkelmesser (Vorschau)
js/app.js               Ansichtswechsel, Bedienelemente, Service Worker
sw.js                   Offline-Cache
manifest.webmanifest    PWA-Manifest
scripts/make-icons.js   erzeugt die PNG-Icons (node scripts/make-icons.js)
```

## Lokal starten

```bash
python3 -m http.server 8000
# http://localhost:8000
```

Ein Service Worker wird nur über HTTPS oder auf `localhost` registriert.

## Veröffentlichen

Die App wird per SFTP aus GitHub auf den Webspace gespiegelt – der Workflow
liegt unter `.github/workflows/deploy.yml`. Einrichtung, Secrets und der
Umgang mit Hostschlüsseln stehen in **[DEPLOYMENT.md](DEPLOYMENT.md)**.

Alternativ als GitHub Pages: *Settings → Pages → Source: Deploy from a branch*,
Branch wählen, Ordner `/ (root)`. Alle Pfade sind relativ, die App läuft daher
auch in einem Unterverzeichnis.

## Stand

- [x] Lineal in Originalgröße, cm/mm und Zoll
- [x] Bildschirmerkennung und Kalibrierung
- [x] Offline-Betrieb, installierbar
- [ ] Winkelmesser: interaktive Messung mit beweglichen Schenkeln
