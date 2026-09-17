# Zollstock

Statische PWA zum Messen: zeigt ein **Lineal in Originalgröße** auf dem Display,
eine **Messlehre** für Bohrer und Rohre und einen **Winkelmesser**, der die Lage
des Geräts ausliest.

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

Alle Wege liegen unter dem Zahnrad oben rechts:

1. **Maßstab prüfen** – die empfohlene Methode. Die Karte liegt bündig an einer
   festen Linie, eine zweite wird auf ihr anderes Ende geschoben. Daneben steht,
   wie weit der eingestellte Maßstab danebenliegt; *Übernehmen* korrigiert ihn.
2. **Karte anlegen** – derselbe Bezug als Umriss, den ein Regler auf die Karte
   zieht.
3. **Linie messen** – eine Referenzlinie mit einem echten Lineal messen und die
   Länge in Millimetern eintragen.
4. **PPI eingeben** – Herstellerangabe zur Pixeldichte direkt eintragen.

Die Probe ist der Prüfung wegen da: Ohne sie steht in den Einstellungen nur
„automatisch“, und niemand weiß, ob der Tabellenwert für dieses Gerät stimmt.
Sie ist zugleich die genauere Handhabung – beim Umriss müssen zwei Kanten
gleichzeitig zur Deckung kommen, während ein Regler die Größe ändert; hier
liegt eine Kante fest an und nur das andere Ende wird angefahren. Die
Abweichung steht dabei als Zahl daneben, so dass auch ein halber Millimeter
sichtbar wird. Aus dem Abstand folgt der Maßstab unmittelbar:

```
px pro Millimeter = Abstand der beiden Linien / Kartenlänge
```

Passt die lange Kartenseite nicht neben die Bedienleiste, wird auf die kurze
(54,0 mm) umgestellt; *Drehen* schaltet von Hand um.

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
Vollbildmessung legt die Karte dann an diese Kante. Die Messfläche muss dabei
bis genau an diese Bildschirmkante reichen – bei der Unterkante wandert die
Bedienleiste deshalb nach oben. Sonst endete die Fläche eine Leistenhöhe zu
früh, und die Linie käme nie bis ans Kartenende. Gespeichert wird in
`localStorage` (`zollstock.edge.v2`); eine ältere Messung „mit Hülle" wird
beim ersten Start für beide Kanten übernommen.

Welcher der beiden Werte gilt, hängt nicht am gewählten Nullpunkt, sondern an
der **Drehung des Bildes**. Das Lineal zählt in Bildschirmkoordinaten, sein
Anfang liegt oben bzw. links – dort liegt aber je nach Drehung eine andere
Kante des Geräts:

| `screen.orientation.angle` | Anfang des Lineals | dort liegt |
| --- | --- | --- |
| 0° | oben | Oberkante |
| 90° | links | Oberkante |
| 180° | oben | Unterkante |
| 270° | links | Unterkante |

In beiden Querformaten läuft das Lineal an der langen Achse, seine Enden sind
also weiterhin Ober- und Unterkante – nur seitlich, und bei 270° vertauscht.
`Edge.edgeAt()` löst das auf; ohne diese Zuordnung rechnete die Skala in zwei
von vier Lagen mit dem Rand der falschen Kante.

Ist die Kante an diesem Ende nicht vermessen, steht ihr Nullpunkt dort nicht
zur Wahl. Die Skala bleibt dann an derselben Seite und rückt auf den
Bildschirmrand, statt in die Mitte zu springen.

### Heller Grund

Der Knopf mit dem halb gefüllten Kreis oben rechts schaltet auf hellen Grund:
weiße Fläche, schwarze Striche. Gedacht ist er zum Anlegen – ein dunkler
Bohrer vor schwarzem Bildschirm ist kaum zu beurteilen, vor Weiß steht sein
Umriss. Bei Sonne ist es ohnehin besser lesbar.

Auch die zuletzt benutzte Ansicht wird gemerkt (`zollstock.view.v1`).

Umgesetzt ist der helle Grund als zweiter Satz derselben Farbwerte unter
`:root[data-theme="light"]`; die Zeichenflächen holen ihre Farben zur Laufzeit
von dort, ein Neuzeichnen genügt also. Die Wahl liegt in `localStorage`
(`zollstock.theme.v1`), voreingestellt bleibt Dunkel. Die Leiste des Browsers
geht über `meta[name=theme-color]` mit.

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
| ◐ | heller Grund zum Anlegen |
| ⚙ | Einstellungen: Kalibrierung, Gerätekante, laufender Stand |
| Lineal / Lehre / Winkel | Ansicht wechseln; die zuletzt benutzte kommt beim nächsten Start wieder |
| Nullpunkt und Einstellungen | nur in der Linealansicht, im Winkelmesser ausgeblendet |
| Nullen / Fläche merken | aktuelle Lage zur Null bzw. zur Bezugsfläche machen; nochmal drücken hebt sie auf |
| Halten / Tippen auf die Skala | Messwert einfrieren und wieder lösen |
| Kante / Fläche | Messart des Winkelmessers |

An beiden Kanten steht dieselbe **Zentimeterteilung** mit Millimeterstrichen –
so lässt sich von jeder Seite anlegen. Die Messmarke nennt den Wert in
Zentimetern.

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

## Messlehre

Die Lehre nutzt dasselbe, was das Lineal nutzt – den kalibrierten Maßstab –,
nur als Vergleichsform statt als Skala. Drei Sätze, umschaltbar unter der
Anzeige:

| Satz | Form | Maße |
| --- | --- | --- |
| **Bohrer** | Schlitze | 1–16 mm in ganzen Schritten, mit Dübel und Schraube |
| **Schraube** | Schlitze | metrisches Regelgewinde M3–M16, Schaftdurchmesser |
| **Schlüssel** | Schlitze | Schlüsselweiten SW 1,5 – SW 24 |
| **Sechskant** | Sechsecke | dieselben Weiten als Umriss zum Auflegen |
| **Rohr mm** | Halbkreise | Kupfer nach EN 1057 (6–54 mm) und Verbund-/PE-Rohre (16–63 mm) |
| **Rohr Zoll** | Halbkreise | Gewinderohre nach EN 10255 / DIN 2440, ⅛″ bis 3″ |

Die Sätze passen nicht mehr nebeneinander auf ein Handy – die Leiste unter
der Anzeige schiebt sich seitlich, statt umzubrechen, und rückt den gewählten
Satz ins Bild.

Beide Formen stehen als **Liste untereinander**, jedes Maß am linken
Bildschirmrand; durchgeblättert wird durch **Scrollen**. Die Zeichenfläche
wächst dafür mit dem Inhalt, gescrollt wird vom Browser. Getippt wird
ausgewählt, gezogen wird gescrollt – unterschieden wird am zurückgelegten Weg.

**Bohrer** werden waagerecht in einen nach links offenen Schlitz gelegt: zwei
Striche mit genau dem lichten Abstand des Nenndurchmessers. Weil die Striche
außerhalb dieses Abstands stehen, ist die lichte Weite auf den
Zehntelmillimeter genau der Nennwert – passt der Bohrer ohne Luft und ohne
Überstand hinein, stimmt das Maß.

Halbe Millimeter gibt es bewusst nicht: Ein halber Millimeter sind auf dem
Bildschirm nur ein paar Bildpunkte – so genau lässt sich ein Bohrer von Hand
nicht anlegen, und eine Zahl vorzugaukeln, die nicht trägt, hilft niemandem.

Wo ein Universaldübel dazugehört, steht er daneben: `6 mm · Dübel 6 ·
Schraube 3,5–5` (Maße nach Fischer SX und Baugleichen). Am Bohrer ist die
Frage selten „wie dick", sondern „was passt da rein" – und die stellt sich
genau dann, wenn man ihn in der Hand hält. Die übrigen Maße bleiben ohne
Nebenzeile, statt sie mit Ungefährem zu füllen.

**Schrauben** werden über dem Gewinde am Schaft gemessen; das Gewinde selbst
misst sich ein bis zwei Zehntel unter seinem Nennmaß. Neben jedem Maß stehen
Kernloch und Schlüsselweite – die Frage am Werkzeugkasten ist ja meist nicht
„wie dick", sondern „was brauche ich dafür". Die Schlüsselweiten folgen dem
Sechskant nach DIN 934 (M10 → SW 17, M12 → SW 19); ISO 4032 führt dort 16 und
18.

**Schlüsselweiten** sind der Abstand der beiden Schlüsselflächen – genau das,
was zwischen die Striche passt und was der Sechskant breit ist. Die Reihe
fängt bei den Innensechskanten an (SW 1,5 nach DIN 912) und geht bis zu den
großen Muttern (SW 24 nach DIN 934): Ein Inbusschlüssel ist selbst ein
Sechskant, für ihn gilt dieselbe Lehre. Wozu eine Weite gehört, steht daneben
– wo beides auf dieselbe Weite fällt, beides (SW 8 ist Mutter M5 und
Inbus M10).

Der **Sechskant** zeigt dieselben Weiten als Umriss: Mutter oder Schraubenkopf
auflegen und drehen, bis er deckt. Das prüft beide Maße auf einmal –
Schlüsselweite und Eckenmaß –, während ein Schlitz nur die Weite kennt und
dafür parallel ausgerichtet sein will. Gezeichnet wird ab 30°, damit die
beiden Flanken senkrecht stehen und die Breite des Umrisses genau die
Schlüsselweite ist; die Höhe ist dann das Eckenmaß, also das 2/√3-fache.

Bei den kleinen Weiten wird der Strich dünner: Ein 1,4 px breiter Strich wäre
bei SW 1,5 ein knappes Fünftel des Maßes, dann ist nicht mehr zu sehen, was
deckt. Die Beschriftung steht in einer festen Spalte, sonst wanderte sie mit
jeder Zeile weiter nach rechts.

**Rohre** werden an die Kante gehalten und mit einem **Halbkreis** verglichen,
dessen Mittelpunkt auf ihr liegt – die andere Hälfte ragt über den Rand
hinaus. Ausgerichtet wird an den beiden kurzen Strichen, die die Enden des
Durchmessers markieren: liegen dort die weitesten Stellen des Rohrs, muss der
Bogen mit seiner Außenkante zusammenfallen. Der Halbkreis braucht nur den
halben Platz in der Breite – auch 3″ (88,9 mm) ist damit auf einem Handy
darstellbar.

Bei Rohren sind alle Maße **Außendurchmesser**. Bei Zollrohren ist die
Zollangabe der Gewindename, nicht das Maß: ½″ hat 21,3 mm außen, 1″ hat
33,7 mm. Die Anzeige oben links nennt deshalb beides.

Auf schwarzem Grund ist ein dunkler Bohrer kaum vom Hintergrund zu
unterscheiden – dafür gibt es den **hellen Grund** (siehe unten).

Ein Tipp auf einen Schlitz oder Halbkreis hebt ihn hervor – nochmal tippen
nimmt es zurück. Beim Satzwechsel fängt die Liste wieder oben an.

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
| **Kante** | Drehung in der Bildschirmebene, `atan2(−ux, uy)` – Gerätekante anlegen | **Gefälle** oder, weiter von der Waagerechten, wie weit es noch bis 90° und bis 180° ist; dazu die **Kippung** |
| **Fläche** | Neigung der Auflagefläche, `acos(|uz|)` – Gerät flach auflegen; mit gemerkter Bezugsfläche der Winkel zu dieser | **Längs** und **Quer**: die beiden Achsen einzeln |

Das **Gefälle** steht unter der Gradzahl, sobald die Anzeige näher als 20° an
der Waagerechten liegt: `2,0 % · 20 mm/m`. Das ist die Einheit, in der es auf
dem Bau vorgegeben wird – Abwasser 2 %, Terrasse 2 %, Dachrinne 3 mm/m –, und
Grad hilft dort niemandem. Gerechnet wird der Tangens der Abweichung von der
Waagerechten; im Kantenmodus zählt auch die Nähe zur gestreckten Lage, denn
ein andersherum angelegtes Rohr hat dasselbe Gefälle.

Weiter von der Waagerechten sagt ein Prozentwert nichts mehr (68° wären
247 %), dort steht stattdessen, wie weit es bis zum rechten und bis zum
gestreckten Winkel ist. Jede der beiden Angaben erscheint genau dort, wo sie
etwas bedeutet. Im Flächenmodus gilt dasselbe: nahe der Waagerechten das
Gefälle, darüber Längs und Quer – wohin es kippt, zeigt ohnehin die Libelle.

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

Nullpunkt und gemerkte Bezugsfläche überstehen ein Neuladen
(`zollstock.protractor.v1`) – sie gehören zur laufenden Arbeit, und seit die
App sich selbst nachlädt, wären sie sonst mitten im Messen weg. Dass sie
gelten, ist an der Taste zu sehen, die dann „Zurücksetzen“ heißt. Der
Haltezustand wird nicht gemerkt: einen eingefrorenen Messwert über einen
Neustart zu retten, ergibt keinen Sinn.

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
index.html              Gerüst aller Ansichten
css/style.css           Darstellung
js/devices.js           Bildschirmerkennung, Gerätetabellen
js/calibration.js       Kalibrierung inkl. Vollbild-Kartenabgleich
js/check.js             Maßstabsprobe an der Karte
js/scales.js            Skalenteilung und Lage des Nullpunkts
js/edge.js              Randversatz, je Wert für Ober- und Unterkante
js/ruler.js             Lineal (Canvas)
js/gauge.js             Messlehre für Bohrer und Rohre
js/protractor.js        Winkelmesser (Lagesensor, Ring- und Bandskala)
js/app.js               Ansichtswechsel, Bedienelemente, Service Worker
sw.js                   Offline-Cache
manifest.webmanifest    PWA-Manifest
scripts/make-icons.js   erzeugt die PNG-Icons (node scripts/make-icons.js)
tests/                  Prüfstrecke – gehört nicht zur App
```

## Prüfstrecke

```bash
cd tests
npm install
npm test
```

Geprüft wird, was sich nachrechnen lässt: die lichten Weiten der Schlitze, die
Maße der Sechskante und Halbkreise, wo die Null im Lineal sitzt, die
Umrechnungen des Winkelmessers, ob die Messfläche bis an die Bildschirmkante
reicht, ob Gemerktes ein Neuladen übersteht. 47 Behauptungen in dreizehn
Prüfungen; ein Teilwort als Argument läuft nur die passenden (`npm test lehre`).

Gemessen wird in den Bildpunkten der Zeichenfläche – über die Schwerpunkte der
gezeichneten Striche, weil die gegen Kantenglättung unempfindlich sind. Der
Maßstab wird dafür fest auf 5,5 px/mm gesetzt, damit die Erwartungswerte nicht
am erkannten Gerät hängen.

Die Prüfstrecke braucht `playwright-core` und einen Chromium. Ihre
`package.json` liegt in `tests/`, damit das Projekt selbst ohne Build und ohne
Abhängigkeiten bleibt. Gefunden wird der Browser über `CHROME_PATH`, über
`PLAYWRIGHT_BROWSERS_PATH` oder an den üblichen Orten; sonst hilft
`npx playwright install chromium`.

**Was sie nicht kann:** Sie sieht nicht, dass „Nicht stören" das Vibrieren
abwürgt, ob 425 ppi für dieses Display stimmen oder ob ein Bohrer wirklich in
den Schlitz passt. Sie prüft Rechnung und Anordnung, nicht die Physik – das
Handy bleibt die letzte Instanz.

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
- [x] Bildschirmerkennung und Kalibrierung, Maßstabsprobe an der Karte
- [x] Randversatz je Wert für Ober- und Unterkante
- [x] Messlehre für Bohrer, Schrauben, Schlüsselweiten, Sechskant und Rohre
- [x] Heller Grund zum Anlegen dunkler Teile
- [x] Winkelmesser über den Lagesensor, grobe und feine Skala, zwei Messarten, Haltetaste
- [x] Offline-Betrieb, installierbar

## Lizenz

Zollstock steht unter der [MIT-Lizenz](LICENSE).

Fremder Code ist nicht enthalten: keine Bibliotheken, kein Build-Schritt, die
Icons erzeugt `scripts/make-icons.js` selbst.
