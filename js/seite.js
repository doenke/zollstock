/* Gemeinsames Skript der Textseiten (Kontakt, Datenschutz).
 *
 * Läuft im Seitenkopf, damit die Grundfarbe steht, bevor zum ersten Mal
 * gezeichnet wird – sonst blitzt kurz die falsche auf. */
(function () {
  'use strict';

  var THEME_KEY = 'zollstock.theme.v1';

  /* Wer in der App den hellen Grund gewählt hat, bekommt ihn auch hier.
   * Ohne gemerkte Wahl entscheidet die Einstellung des Browsers – das
   * erledigt die Mediaabfrage im Stylesheet. */
  try {
    var gemerkt = localStorage.getItem(THEME_KEY);
    if (gemerkt === 'light' || gemerkt === 'dark') {
      document.documentElement.setAttribute('data-theme', gemerkt);
    }
  } catch (err) {
    /* Privater Modus – dann bleibt es bei der Einstellung des Browsers. */
  }

  /* Die Adresse steht nicht am Stück im Quelltext: Adresssammler lesen die
   * Seite so, wie der Server sie ausliefert, und setzen nichts zusammen.
   * Aufhalten lässt sich damit nicht jeder, aber die einfachen Sammler.
   * Ohne Skript bleibt die lesbare Fassung mit „(at)“ stehen – abschreiben
   * geht also in jedem Fall. */
  function adressen() {
    var felder = document.querySelectorAll('[data-mail][data-host]');

    for (var i = 0; i < felder.length; i++) {
      var feld = felder[i];
      var adresse = feld.getAttribute('data-mail') + '@' + feld.getAttribute('data-host');
      var link = document.createElement('a');

      link.href = 'mailto:' + adresse;
      link.textContent = adresse;
      feld.parentNode.replaceChild(link, feld);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', adressen);
  } else {
    adressen();
  }
}());
