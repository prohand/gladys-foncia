# Foncia für Gladys Assistant

Diese Integration bringt dein **MyFoncia**-Konto (Foncia, Hausverwaltung:
Wohnungseigentum und Vermietung) in Gladys: Kontosaldo, nächster fälliger
Betrag, offene Vorfälle, neue Dokumente und die nächste Eigentümerversammlung.
Dazu kommen Szenenauslöser, Szenenaktionen und ein Dashboard-Widget.

> Inoffizielle Integration. Foncia veröffentlicht keine API: Die Integration
> liest dein Konto so, wie es die Website my-foncia.fonciamillenium.net tut. Ändert Foncia seine
> Website, kann die Integration bis zu einem Update nicht mehr funktionieren.

## Voraussetzungen

- Gladys Assistant **5.3** oder neuer.
- Ein MyFoncia-Konto (E-Mail und Passwort) **ohne zweiten Faktor** (SMS- oder
  App-Code bei jeder Anmeldung): Den kann die Integration nicht beantworten.
- Internetzugang für Gladys. Es ist eine **Cloud**-Integration: In deinem
  lokalen Netzwerk läuft nichts.

## Konfiguration

| Feld                             | Was eingeben                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------- |
| MyFoncia-E-Mail                  | Die E-Mail-Adresse, mit der du dich auf my-foncia.fonciamillenium.net anmeldest.                  |
| MyFoncia-Passwort                | Dein Passwort. Von Gladys als Geheimnis gespeichert, nur an die Anmeldeseite von Foncia gesendet. |
| Synchronisierungsintervall (min) | Wie oft MyFoncia gelesen wird. Standard 60, mindestens 15.                                        |
| Fälligkeitserinnerung (Tage)     | Wie viele Tage vor einer Fälligkeit der Auslöser „Zahlung bald fällig“ auslöst. Standard 7.       |
| Erweiterte Einstellungen         | Leer lassen, siehe [Erweiterte Einstellungen](#erweiterte-einstellungen).                         |

Drücke dann **Verbindung testen**: Die Meldung listet die gefundenen Konten auf.
**Jetzt synchronisieren** liest MyFoncia sofort.

## Geräte

Ein Gladys-Gerät pro MyFoncia-Konto (eine Wohnung einer Eigentümergemeinschaft,
eine Mietwohnung), mit dem Namen `Foncia – <Konto>`. Lege es im Tab **Entdecken**
an. Seine Funktionen sind schreibgeschützt und behalten ihren Verlauf:

| Funktion                           | Einheit | Bedeutung                                                                     |
| ---------------------------------- | ------- | ----------------------------------------------------------------------------- |
| Kontosaldo                         | €       | Wie von MyFoncia angezeigt (negativ: du schuldest Geld).                      |
| Nächster fälliger Betrag           | €       | Betrag des nächsten Zahlungsaufrufs oder der nächsten Miete.                  |
| Tage bis zur Fälligkeit            | Tage    | Negativ, sobald das Datum vorbei ist.                                         |
| Offene Vorfälle                    | —       | Noch nicht abgeschlossene Anfragen an Foncia (Reparaturen, Vorfälle, Fragen). |
| Neue Dokumente                     | —       | Dokumente, die seit der letzten Markierung als gesehen hinzugekommen sind.    |
| Tage bis zur Eigentümerversammlung | Tage    | Nächste Versammlung der Eigentümergemeinschaft.                               |

Das Abzeichen des Geräts zeigt **Cloud**, oder **nicht erreichbar**, wenn die
letzte Synchronisierung fehlgeschlagen ist.

## Szenenauslöser

Sie lösen nur für **Neues** aus: Die erste Synchronisierung nach der Installation
lernt nur, was schon da ist. Höchstens 5 Ereignisse jeder Art pro
Synchronisierung, damit eine Szene, die pro Dokument eine Benachrichtigung
schickt, dein Handy nie überflutet.

| Auslöser                    | Filter              | Variablen                                          |
| --------------------------- | ------------------- | -------------------------------------------------- |
| Neues Foncia-Dokument       | Konto, Dokumenttyp  | Konto, Titel, Datum                                |
| Foncia-Vorfall aktualisiert | Konto, neuer Status | Konto, Titel, vorheriger Status                    |
| Zahlung bald fällig         | Konto               | Konto, Betrag, Fälligkeitsdatum, verbleibende Tage |
| Versammlung angekündigt     | Konto               | Konto, Titel, Datum, verbleibende Tage             |

Dokumenttypen: Zahlungsaufruf, Eigentümerversammlung, Nebenkostenabrechnung,
Rechnung oder Quittung, anderes. Vorfallstatus: offen, in Bearbeitung,
abgeschlossen.

Beispiel: _„Wenn ein neues Foncia-Dokument vom Typ **Zahlungsaufruf** ankommt,
schicke mir eine Nachricht: Neuer Zahlungsaufruf: {{triggerEvent.data.title}}“_.

## Szenenaktionen

- **Foncia synchronisieren**: liest MyFoncia jetzt und gibt den nächsten
  Aktionen die Zahlen eines Kontos (leer = das erste): Erfolg, Konto, Saldo,
  fälliger Betrag, Fälligkeitsdatum, offene Vorfälle, neue Dokumente.
- **Foncia-Dokumente als gesehen markieren**: setzt den Zähler „Neue Dokumente“
  auf 0 zurück (für ein Konto oder alle).

## Dashboard-Widget

**Foncia-Konto**: Saldo, fälliger Betrag (0 €, wenn nichts fällig ist), letzte
Zahlung und neue Dokumente, Verbindung und letzte Synchronisierung, nächste Fälligkeit und nächste
Versammlung, die fünf neuesten Dokumente und zwei Schaltflächen:
**Synchronisieren** und **Als gesehen**. Wähle in seinen Einstellungen das
anzuzeigende Konto (leer = das erste).

Ein Strich (—) bedeutet, dass MyFoncia nicht gelesen werden konnte: Siehe die Logs der Integration.

## Datenschutz

- Das Passwort wird nur an die Anmeldeseite von Foncia
  (`login.my-foncia.fonciamillenium.net`) gesendet. Es wird nie in die Logs geschrieben.
- Die Zugriffstoken bleiben im Speicher. Die einzige geschriebene Datei ist
  `/data/foncia-state.json`: die IDs der bereits gesehenen Dokumente, Vorfälle
  und Versammlungen, damit nach einem Neustart kein Auslöser doppelt auslöst.

## Fehlerbehebung

| Meldung                                                     | Was tun                                                                            |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| MyFoncia hat die E-Mail-Adresse oder das Passwort abgelehnt | Prüfe sie mit einer Anmeldung auf my-foncia.fonciamillenium.net.                   |
| verlangt einen zweiten Faktor                               | Nicht unterstützt: Das Konto verlangt bei jeder Anmeldung einen Code.              |
| Das MyFoncia-Konto ist gesperrt                             | Entsperre es auf my-foncia.fonciamillenium.net und drücke dann Verbindung testen.  |
| Die MyFoncia-Client-ID fehlt                                | Siehe [Erweiterte Einstellungen](#erweiterte-einstellungen).                       |
| MyFoncia ist nicht erreichbar                               | Prüfe den Internetzugang von Gladys.                                               |
| MyFoncia hat mit einem Fehler geantwortet                   | Sieh dir die Logs der Integration an; Foncia hat seine Website eventuell geändert. |

## Erweiterte Einstellungen

Die Integration meldet sich mit denselben Einstellungen an wie die
MyFoncia-Website: deren Okta-**Client-ID** und die Adresse ihrer **API**. Beide
sind eingebaut: Lass die zwei Felder leer.

Ändert Foncia sie eines Tages und schlägt jede Synchronisierung mit einem
API-Fehler fehl, lies die neuen Werte in
<https://my-foncia.fonciamillenium.net/config.js>: `clientId` unter `oktaConfig`
ist die **Okta-Client-ID**, `url` unter `graphql` ist die **URL der
MyFoncia-API**. Trage sie in die erweiterten Einstellungen ein, speichere und
drücke **Verbindung testen**. Eröffne bitte auch ein Issue im Repository, damit
die eingebauten Werte für alle aktualisiert werden.
