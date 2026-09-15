# Zollstock

Statische PWA zum Messen: zeigt ein **Lineal in Originalgröße** auf dem Display –
zwei frei wählbare Skalen – und einen **Winkelmesser**, der die Lage des Geräts
ausliest.

Kein Build, keine Abhängigkeiten, offline nutzbar.

## Wie die Originalgröße zustande kommt

Browser geben die physische Pixeldichte nicht direkt preis. Verfügbar sind nur:

| Wert | Bedeutung |
| --- | --- |
| `screen.width` / `screen.height` | logische Auflösung in CSS-Pixeln |
| `devicePixelRatio` | Verhältnis physischer zu logischen Pixeln |
| Modell aus User-Agent bzw. Client Hints | nur Android, z. B. `SM-S911B` |

Daraus leitet `js/devices.js` die Pixeldichte ab:

```
physische Pixel     = CSS-Pixel × devicePixelRatio
CSS-Pixel pro Zoll  = ppi ÷ devicePixelRatio
CSS-Pixel pro mm    = ppi ÷ devicePixelRatio ÷ 25,4
```

**Android** nennt sein Modell – damit wird die Dichte in einer Modelltabelle
nachgeschlagen (Galaxy S/Note/A/Z, Pixel). Chrome kürzt den User-Agent
allerdings auf `Android 10; K`; das echte Modell liefert dann erst
`navigator.userAgentData.getHighEntropyValues(['model'])`, und zwar asynchron –
die App reicht die Korrektur nach. Meldet das Gerät weniger Pixel als das
Panel hat (etwa FHD+ statt WQHD+ eingestellt), wird die Dichte im selben
Verhältnis heruntergerechnet.

**Apple** nennt kein Modell, dort sind CSS-Auflösung und Pixelverhältnis je
Gerät aber eindeutig. Diese Tabelle gilt ausschließlich für iOS-Geräte: die
Schlüssel sind nicht herstellerübergreifend eindeutig – ein Galaxy S22/S23
meldet mit 360 × 780 bei dpr 3 genau dasselbe wie ein iPhone 13 mini.

Ohne Treffer greift die Konvention der Plattform (Mobilgeräte ≈ 160 dpi,
Desktop = 96 dpi) – das ist nur eine Näherung, deshalb weist die App dann auf
die Kalibrierung hin. Unter *Einstellungen → Kalibrierung* steht, was erkannt
wurde und wie sicher.

Die Tabellenwerte sind Herstellerangaben und ein guter Startwert. Wer es
genau braucht, kalibriert – das überstimmt die Erkennung immer.

### Kalibrierung

Drei Wege, alle unter dem Zahnrad oben rechts:

1. **EC-/Kreditkarte** – genormt 85,6 × 54,0 mm (ISO/IEC 7810 ID-1). Karte auflegen,
   Umriss im Vollbild anpassen. Genaueste Methode.
2. **Linie messen** – eine Referenzlinie mit einem echten Lineal messen und die
   Länge in Millimetern eintragen.
3. **PPI eingeben** – Herstellerangabe zur Pixeldichte direkt eintragen.

Das Ergebnis liegt in `localStorage` (`zollstock.calibration.v1`) und gilt für
dieses Gerät, bis es über „Automatik“ zurückgesetzt wird.

### Rand und Schutzhülle

Zwischen der Kante des Geräts und dem ersten Bildpunkt liegen einige
Millimeter Rahmen – mit Hülle deutlich mehr. Wer ein Werkstück an die
Gehäusekante anlegt, misst diesen Rand sonst mit.

Gemessen wird er wieder mit der Karte, diesmal als Lückenfüller: Die Karte
liegt flach auf dem Bildschirm, bündig an der Kante des Geräts (oder der
Hülle) am Nullpunkt des Lineals, und ragt mit bekannter Länge auf das
Display. Sichtbar ist davon nur der Teil hinter dem Rand – der Rest steckt
darunter:

```
Rand = Kartenlänge − sichtbarer Anteil
```

In der Vollbildmessung wird eine Linie auf das Ende der Karte geschoben, den
Rest rechnet die App aus. Passt die lange Seite nicht neben die Bedienleiste,
wird automatisch auf die kurze Seite (54,0 mm) umgestellt; *Drehen* schaltet
von Hand um.

Ist der Rand bekannt, beginnt die Skala an der Gerätekante statt am
Bildschirmrand – die erste Zahl oben ist dann nicht mehr die Null.

Dafür gibt es zwei Profile, **Ohne Hülle** und **Mit Hülle**, jedes mit
eigenem Wert. Das aktive Profil steht als Schild in der Kopfzeile; ein Tipp
darauf wechselt, sobald die Hülle ab- oder drankommt. Gespeichert wird in
`localStorage` (`zollstock.edge.v1`).

### Genauigkeit

Die Nulllinie liegt am Rand des **sichtbaren Bereichs**, nicht am Gehäuserand.
Im Browser verschiebt die Adressleiste diesen Rand. Für randgenaues Messen die
App zum Startbildschirm hinzufügen – als installierte PWA läuft sie im Vollbild.

## Bedienung

| Element | Funktion |
| --- | --- |
| Tippen auf die Skala | Messmarke dorthin setzen |
| Ziehen | Marke verschieben; dicht am Griff wird sie angefasst statt versetzt |
| ↓ ↑ → ← | Zählrichtung umdrehen: Null an der oberen oder der unteren Kante |
| Schild in der Kopfzeile | zwischen „Ohne Hülle" und „Mit Hülle" wechseln |
| ⚙ | Einstellungen: Einheiten und Kalibrierung |
| Lineal / Winkel | Ansicht wechseln |
| Ausrichten | 0° nach oben legen, auf die nächste Vierteldrehung gerundet |
| Nullen | aktuelle Lage zur Null machen, ohne Rundung |
| Halten / Tippen auf die Skala | Messwert einfrieren und wieder lösen |
| Kante / Fläche | Messart des Winkelmessers |

Es werden immer **zwei Skalen** gezeichnet – eine an jeder Kante. Welche
Einheit auf welcher Kante liegt, steht in den Einstellungen unter *Skalen*;
zur Wahl stehen Zentimeter, Millimeter und Zoll (Sechzehntel-Teilung).
Voreingestellt ist cm links bzw. oben und Zoll rechts bzw. unten. Die Auswahl
liegt in `localStorage` (`zollstock.scales.v1`).

Das Lineal läuft entlang der längeren Bildschirmkante und folgt der
Geräteausrichtung.

Der Pfeil in der Kopfzeile dreht die **Zählrichtung** um: Die Null sitzt
wahlweise an der oberen oder an der unteren Kante (im Querformat links oder
rechts). Er zeigt, wohin gezählt wird. Die Randmessung folgt mit – die Karte
wird an der Kante angelegt, an der die Null liegt. Während des Messens hält die App den Bildschirm wach
(Wake-Lock, sofern vom Browser unterstützt).

## Winkelmesser

Aus `beta` und `gamma` des Lagesensors wird die Richtung „oben" im
Gerätesystem berechnet – die dritte Zeile der Drehmatrix Z-X'-Y'':

```
ux = −cos(beta) · sin(gamma)
uy =  sin(beta)
uz =  cos(beta) · cos(gamma)
```

Senkrecht im Hochformat ergibt das (0, 1, 0), flach auf dem Tisch (0, 0, 1).
Dreht das Betriebssystem die Ansicht ins Querformat, wird der Vektor um
`screen.orientation.angle` mitgedreht – sonst zeigte die Skala im Querformat
90° daneben. Ein Tiefpass glättet das Zittern des Sensors.

Zwei Messarten, umschaltbar unter der Anzeige:

| Messart | Hauptwert | zweiter Wert |
| --- | --- | --- |
| **Kante** | Drehung in der Bildschirmebene, `atan2(−ux, uy)` – Gerätekante anlegen | **Kippung**: wie weit der Bildschirm aus der Senkrechten kippt. Über 45° wird zum Aufrichten geraten, weil der Hauptwert dann ungenau wird. |
| **Fläche** | Neigung der Auflagefläche, `acos(|uz|)` – Gerät flach auflegen | **Längs** und **Quer**: die beiden Achsen einzeln |

Angezeigt wird auf zwei Skalen: grob als Ringteilung mit 1°-Strichen, die wie
ein Lot im Raum stehen bleibt, während der feste Zeiger oben den Wert
abgreift – im Flächenmodus stattdessen als Dosenlibelle mit Ringen bei 2°, 5°
und 10°.

Fein als Bandskala darunter. Sie hat **alle 45° eine Null** und zählt von dort
nach beiden Seiten, in Viertelgrad-Schritten. Gebraucht wird ohnehin nur der
Bereich um die jeweilige Null, deshalb ist die Teilung bis ± 10° voll sichtbar
und verblasst dahinter – zwischen zwei Nullen bleibt das Band dunkel. Rechts
steht, auf welche Marke sich die Skala gerade bezieht.

**Halten** friert die Lage ein: Ring, Libelle, Bandskala und Anzeige stehen
still, bis erneut gedrückt wird – gedacht für Stellen, an denen das Gerät
angelegt werden muss, ohne dass man den Bildschirm dabei sieht. Ein Tipp auf
die Skala selbst tut dasselbe, sie ist die größere Fläche. Während des Haltens
ruht auch die Zeichenschleife.

Zwei Arten, den Nullpunkt zu setzen:

**Ausrichten** legt die 0 nach oben und rundet auf die nächste Vierteldrehung:
`Math.round(Winkel / 90) * 90`. Damit gibt es vier Nullstellungen – das Gerät
kann hochkant, quer oder auf dem Kopf angelegt werden und zeigt trotzdem die
Abweichung von der Waagerechten bzw. Senkrechten.

**Nullen** macht die aktuelle Lage zur Null, ohne jede Rundung. Dafür, wenn
gegen eine beliebige Bezugskante gemessen werden soll: anlegen, nullen, und
alles Weitere zählt von dort.

Im Flächenmodus gibt es nichts zu nullen, dort sind beide Tasten gesperrt.

Auf iOS muss der Zugriff auf den Lagesensor einmal bestätigt werden
(`DeviceOrientationEvent.requestPermission`); dafür erscheint eine
Schaltfläche. Fehlt der Sensor ganz, sagt die App das und bleibt bei 0°.

## Aufbau

```
index.html              Gerüst beider Ansichten
css/style.css           Darstellung
js/devices.js           Bildschirmerkennung, Gerätetabellen
js/calibration.js       Kalibrierung inkl. Vollbild-Kartenabgleich
js/scales.js            Einheiten der beiden Skalen
js/edge.js              Randversatz, Profile für Gerät und Hülle
js/ruler.js             Lineal (Canvas)
js/protractor.js        Winkelmesser (Lagesensor, Ring- und Bandskala)
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

Die App liefert ihre Dateien aus dem Cache aus – anders ginge Offline-Betrieb
nicht. Nach einem Deploy fällt dem Browser beim Öffnen auf, dass `sw.js` sich
geändert hat; er lädt den neuen Stand in einen Cache mit dem neuen Namen und
die App blendet „Neue Version – tippen zum Laden" ein. Eine installierte App,
die nur aus dem Hintergrund geholt wird, prüft beim Sichtbarwerden selbst
nach.

## Veröffentlichen

Die App wird per SFTP aus GitHub auf den Webspace gespiegelt – der Workflow
liegt unter `.github/workflows/deploy.yml`. Einrichtung, Secrets und der
Umgang mit Hostschlüsseln stehen in **[DEPLOYMENT.md](DEPLOYMENT.md)**.

Alternativ als GitHub Pages: *Settings → Pages → Source: Deploy from a branch*,
Branch wählen, Ordner `/ (root)`. Alle Pfade sind relativ, die App läuft daher
auch in einem Unterverzeichnis.

## Stand

- [x] Lineal in Originalgröße, zwei frei wählbare Skalen (cm, mm, Zoll)
- [x] Bildschirmerkennung und Kalibrierung
- [x] Randversatz für Gerätekante und Schutzhülle
- [x] Winkelmesser über den Lagesensor, grobe und feine Skala, zwei Messarten, Haltetaste
- [x] Offline-Betrieb, installierbar

## Lizenz

Zollstock steht unter der [MIT-Lizenz](LICENSE).

Fremder Code ist nicht enthalten: keine Bibliotheken, kein Build-Schritt, die
Icons erzeugt `scripts/make-icons.js` selbst.
