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

### Gerätekante

Zwischen der Kante des Geräts und dem ersten Bildpunkt liegen einige
Millimeter Rahmen – mit Hülle deutlich mehr. Wer ein Werkstück an die
Gehäusekante anlegt, misst diesen Rand sonst mit.

Gemessen wird er wieder mit der Karte, diesmal als Lückenfüller: Die Karte
liegt flach auf dem Bildschirm, bündig an der Kante des Geräts – mit Hülle,
wenn eine drauf ist – und ragt mit bekannter Länge auf das Display. Sichtbar
ist davon nur der Teil hinter dem Rand – der Rest steckt darunter:

```
Rand = Kartenlänge − sichtbarer Anteil
```

In der Vollbildmessung wird eine Linie auf das Ende der Karte geschoben, den
Rest rechnet die App aus. Passt die lange Seite nicht neben die Bedienleiste,
wird automatisch auf die kurze Seite (54,0 mm) umgestellt; *Drehen* schaltet
von Hand um.

Ist der Rand bekannt, beginnt die Skala an der Gerätekante statt am
Bildschirmrand – die erste Zahl oben ist dann nicht mehr die Null.

**Oben** und **unten** werden getrennt gemessen und getrennt gespeichert: Das
Display sitzt selten mittig im Gehäuse – die Kinnleiste unten ist meist der
breitere Rand –, und Hüllen sind unten oft anders ausgeschnitten als oben, wo
die Kamera sitzt. Ein Unterschied von ein bis zwei Millimetern ist normal.

Die Umschaltung in den Einstellungen wählt, welche Kante gemessen wird; die
Vollbildmessung legt die Karte dann an diese Kante. Im Querformat gilt der
obere Wert für die linke, der untere für die rechte Kante. Gespeichert wird in
`localStorage` (`zollstock.edge.v2`); eine ältere Messung „mit Hülle" wird
beim ersten Start für beide Kanten übernommen.

### Genauigkeit

Die Nulllinie liegt am Rand des **sichtbaren Bereichs**, nicht am Gehäuserand.
Im Browser verschiebt die Adressleiste diesen Rand. Für randgenaues Messen die
App zum Startbildschirm hinzufügen – als installierte PWA läuft sie im Vollbild.

## Bedienung

| Element | Funktion |
| --- | --- |
| Tippen auf die Skala | Messmarke dorthin setzen |
| Ziehen | Marke verschieben; dicht am Griff wird sie angefasst statt versetzt |
| ↓ ↑ ↕ | Nullpunkt wechseln (siehe unten) |
| ⚙ | Einstellungen: Einheiten und Kalibrierung |
| Lineal / Winkel | Ansicht wechseln |
| Nullpunkt und Einstellungen | nur in der Linealansicht, im Winkelmesser ausgeblendet |
| Nullen / Fläche merken | aktuelle Lage zur Null bzw. zur Bezugsfläche machen; nochmal drücken hebt sie auf |
| Halten / Tippen auf die Skala | Messwert einfrieren und wieder lösen |
| Kante / Fläche | Messart des Winkelmessers |

An beiden Kanten steht dieselbe **Zentimeterteilung** mit Millimeterstrichen –
so lässt sich von jeder Seite anlegen. Die Messmarke nennt den Wert in
Zentimetern und darunter in Millimetern.

Das Lineal läuft entlang der längeren Bildschirmkante und folgt der
Geräteausrichtung.

Der Knopf in der Kopfzeile schaltet den **Nullpunkt** weiter, von einer Kante
zur anderen:

| Lage | Null liegt |
| --- | --- |
| oben, an der Gerätekante | an der Oberkante des Geräts, außerhalb des Bildschirms |
| oben, am Bildschirmrand | am ersten Bildpunkt |
| oben, 1 cm vom Rand | einen Zentimeter innerhalb des Bildschirmrands |
| mittig | in der Bildschirmmitte, zählt nach beiden Seiten |
| unten, 1 cm vom Rand | einen Zentimeter innerhalb der Unterkante |
| unten, am Bildschirmrand | am letzten Bildpunkt |
| unten, an der Gerätekante | an der Unterkante des Geräts |

Eine Gerätekante erscheint nur, wenn ihr Rand vermessen ist – oben und unten
unabhängig voneinander. Der Knopf zeigt als Pfeil, wo die Null sitzt und wohin
gezählt wird (↓ ↑ ↕, im Querformat → ← ↔), dazu `K` für Gerätekante und `1`
für den Zentimeter Abstand. Beim Wechseln wird die Lage kurz ausgeschrieben.

Liegt die Null im sichtbaren Bereich, wird sie als durchgezogene Linie quer
über den Bildschirm gezeichnet und an beiden Skalen groß beschriftet – daran
wird angelegt. Die Messmarke ist gestrichelt, so sind beide
auseinanderzuhalten.

Die Lagen *1 cm vom Rand* sind für Werkstücke gedacht, die sich nicht am
Gehäuse anlegen lassen: Der Nullstrich liegt sichtbar auf dem Bildschirm, das
Werkstück wird daran ausgerichtet. *Mittig* zählt nach beiden Seiten und hilft
beim Mittigfinden. Während des Messens hält die App den Bildschirm wach
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
90° daneben. Dabei ist die Zählrichtung entscheidend: `screen.orientation.angle`
zählt, um wie viel das **Bild** im Uhrzeigersinn gedreht ist, das alte
`window.orientation` von iOS zählt andersherum und wird umgerechnet. Ein Tiefpass glättet das Zittern des Sensors.

Zwei Messarten, umschaltbar unter der Anzeige:

| Messart | Hauptwert | darunter |
| --- | --- | --- |
| **Kante** | Drehung in der Bildschirmebene, `atan2(−ux, uy)` – Gerätekante anlegen | wie weit es noch **bis 90°** und **bis 180°** ist, dazu die **Kippung** |
| **Fläche** | Neigung der Auflagefläche, `acos(|uz|)` – Gerät flach auflegen; mit gemerkter Bezugsfläche der Winkel zu dieser | **Längs** und **Quer**: die beiden Achsen einzeln |

Die **Kippung** – wie weit der Bildschirm aus der Senkrechten kippt – steht als
Zahl und als Bild da: das Gerät von der Seite gesehen, um seine Kippung
geneigt, daneben ein gestricheltes Lot. Steht es senkrecht, decken sich beide.
Über 45° wechselt die Farbe und es wird zum Aufrichten geraten, weil der
Hauptwert dann ungenau wird.

Angezeigt wird auf zwei Skalen: grob als Bogen mit 1°-Strichen, der wie ein Lot
im Raum stehen bleibt, während der feste Zeiger oben den Wert abgreift. Die
Zahlen darauf stehen immer lotrecht, unabhängig davon, wie weit die Teilung
gedreht ist – bei gesetztem Nullpunkt dreht sie nach dem Gerätewinkel, die
Beschriftung wird dann entsprechend zurückgedreht – im
Flächenmodus stattdessen als Dosenlibelle. Deren Bereich richtet sich nach der
Abweichung – 10°, 30° oder 90°, mit Ringen bei einem Fünftel, der Hälfte und
am Rand –, sonst klebte die Blase beim Messen gegen eine Bezugsfläche dauernd
außen. Kleiner wird der Bereich erst ein Stück innerhalb der nächsten Stufe,
damit er nicht an der Grenze hin und her springt. Die
Null und jeder Viertelkreis darauf (45°, 90°, 135°, 180°) stehen mit längerem
Strich und größerer Zahl da und werden immer beschriftet, auch wenn die
übrige Teilung gerade in Zehnerschritten zählt.

Der Bogen zeigt nur einen Ausschnitt von ± 25°. Das ist Absicht: Bei einem
Vollkreis begrenzt die Bildschirmbreite den Halbmesser, die Gradstriche
rücken eng zusammen. Ein Ausschnitt darf einen mehr als doppelt so großen
Halbmesser haben – die Teilung wird entsprechend feiner, und was darüber
hinausgeht, wandert beim Kippen ins Bild.

Fein als Bandskala darunter. Sie hat **alle 45° eine Null** und zählt von dort
nach beiden Seiten, in Viertelgrad-Schritten. Gebraucht wird ohnehin nur der
Bereich um die jeweilige Null: Dort steht die feine Teilung mit Zahlen, weiter
außen bleiben nur die Gradstriche und werden schwächer. Zwischen zwei Nullen
sieht man deshalb bloß noch eine gleichmäßige Strichfolge – und weiß sofort,
dass keine Marke in der Nähe ist.

Steht die Anzeige auf einer **45er-Marke** – also waagerecht, senkrecht oder
im Winkel dazwischen –, gibt das Gerät einen kurzen Stups; die Null bekommt
zwei, damit sie sich unterscheidet. Gemeldet wird beim Eintreten in ein
Fenster von 0,3°, gelöst wird bei 1,2°. Wer das Gerät anlegt und den
Bildschirm dabei nicht sieht, merkt so, wann es sitzt. Geräte ohne
`navigator.vibrate` (iOS) lassen es still.

**Halten** friert die Lage ein: Ring, Libelle, Bandskala und Anzeige stehen
still, bis erneut gedrückt wird – gedacht für Stellen, an denen das Gerät
angelegt werden muss, ohne dass man den Bildschirm dabei sieht. Ein Tipp auf
die Skala selbst tut dasselbe, sie ist die größere Fläche. Während des Haltens
ruht auch die Zeichenschleife.

**Ohne Nullpunkt** misst der Winkelmesser gegen Waagerechte und Senkrechte.
Das gilt in jeder Geräteausrichtung: Dreht das Betriebssystem die Ansicht mit,
wird der Bildschirm zum Bezug, und ein an der Kante angelegtes Gerät zeigt
hochkant wie quer dieselbe Abweichung.

**Nullen** macht die aktuelle Lage zur Null, ohne jede Rundung – für Messungen
gegen eine beliebige Bezugskante: anlegen, nullen, alles Weitere zählt von
dort. Nochmal drücken hebt den Nullpunkt wieder auf.

Ein so gesetzter Nullpunkt hängt am **Gerät**, nicht am Bildschirm. Wer gegen
eine Kante nullt und das Gerät danach dreht, will den tatsächlichen Abstand zu
dieser Kante sehen – auch dann, wenn das Betriebssystem zwischendurch die
Ansicht ins Querformat dreht. Gerechnet wird dafür mit dem Winkel im
Gerätesystem statt im Bildschirmsystem.

Im **Flächenmodus** merkt sich dieselbe Taste – dort **Fläche merken** – die
Bezugsfläche: Gerät auflegen, drücken, auf die zweite Fläche legen. Angezeigt
wird dann der Winkel zwischen beiden Flächen, die Libelle und die Werte für
Längs und Quer beziehen sich ebenfalls darauf, und das Fadenkreuz der Libelle
steht in der Signalfarbe. Zusammen mit **Halten** lassen sich auch Flächen
merken, an denen man den Bildschirm nicht sieht: erst halten, dann merken.

Gerechnet wird mit der kürzesten Drehung, die „oben" der Bezugsfläche auf die
Senkrechte bringt (Formel von Rodrigues); auf den so gekippten Vektor wirken
Hauptwert und Libelle genauso wie sonst auf den ungedrehten. Der Lagesensor
kennt nur die Richtung der Schwerkraft, nicht die Himmelsrichtung – gemessen
wird deshalb der Winkel, um den das Gerät zwischen beiden Auflagen gekippt
wurde. Solange es dabei nicht um die Senkrechte gedreht wird, ist das genau
der Winkel zwischen den Flächen.

Auf iOS muss der Zugriff auf den Lagesensor einmal bestätigt werden
(`DeviceOrientationEvent.requestPermission`); dafür erscheint eine
Schaltfläche. Fehlt der Sensor ganz, sagt die App das und bleibt bei 0°.

## Aufbau

```
index.html              Gerüst beider Ansichten
css/style.css           Darstellung
js/devices.js           Bildschirmerkennung, Gerätetabellen
js/calibration.js       Kalibrierung inkl. Vollbild-Kartenabgleich
js/scales.js            Skalenteilung und Lage des Nullpunkts
js/edge.js              Randversatz, je Wert für Ober- und Unterkante
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

- [x] Lineal in Originalgröße, Zentimeterteilung an beiden Kanten
- [x] Bildschirmerkennung und Kalibrierung
- [x] Randversatz für Gerätekante und Schutzhülle
- [x] Winkelmesser über den Lagesensor, grobe und feine Skala, zwei Messarten, Haltetaste
- [x] Offline-Betrieb, installierbar

## Lizenz

Zollstock steht unter der [MIT-Lizenz](LICENSE).

Fremder Code ist nicht enthalten: keine Bibliotheken, kein Build-Schritt, die
Icons erzeugt `scripts/make-icons.js` selbst.
