# Confluence-Backup-Viewer

> **Lizenz:** AGPL-3.0-only. Siehe [LICENSE](LICENSE), [LICENSING.md](LICENSING.md) und [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Der öffentliche Node.js-Viewer einschließlich SAML-SSO und Lizenzprüfung befindet sich im [GitHub-Repository](https://github.com/ACP120-Post/AtlassianOfflineBackupViewer). Die interne Forge-App zur Schlüsselausstellung ist nicht Teil dieses öffentlichen Repositories.

Lokaler, ausschließlich lesender Viewer für **Confluence Cloud CSV-ZIP-Backups**. React, Vite und ausgewählte Atlaskit-Komponenten bilden die Oberfläche; Node.js übernimmt Import, SQLite-FTS5-Suche und Dateiauslieferung. Es gibt keine Live-Verbindung zu Confluence und keine externe Datenbank.

## Installation und Start

Voraussetzung: **Node.js 24 LTS** mit npm. ZIP-Dateien müssen nicht entpackt werden.

```sh
npm install
npm start
```

Anschließend **http://localhost:3000** öffnen. Der Server bindet ausschließlich an `127.0.0.1`. `Strg+C` beendet ihn. `npm start` baut die lokal installierten Frontend-Assets und importiert neue oder geänderte Backups, bevor der Server startet. Nach `npm install` werden keine Netzwerkdienste benötigt; Atlaskit-Styles werden lokal ausgeliefert, Schriftarten kommen aus dem Betriebssystem.

Standardmäßig werden ZIP-Dateien direkt aus `./backups` sowie aus dem Projektverzeichnis erkannt. Unterverzeichnisse werden nicht durchsucht. Neue ZIP-Dateien erscheinen nach einem Neustart. Das mitgelieferte `confluence_backup_csv_2026-09-10.zip` wird ohne Verschieben erkannt.

Ein alternatives Verzeichnis ersetzt beide Standardquellen:

```sh
npm start -- --backup-dir "/Pfad/zu/meinen/Backups"
```

Optional lassen sich Cache und Port ändern:

```sh
npm start -- --backup-dir ./backups --cache-dir ./.cache --port 3000
```

## Benutzung

- Links ein **Backup** wählen. Seine Bereiche, Inhalte, Suche und Anhänge bleiben vollständig von anderen Backups getrennt, auch bei identischen Confluence-IDs.
- Einen **Bereich** öffnen und im aufklappbaren Seitenbaum navigieren. Standardmäßig erscheinen veröffentlichte Hauptversionen. Über den Statusfilter sind Entwürfe, archivierte und gelöschte Inhalte zugänglich. „Alle Status“ zeigt keine historischen Versionen als zusätzliche Seiten.
- Die **Suche** durchsucht Titel und gespeicherten Body. Alle Suchwörter werden als Präfixe mit UND verbunden; beispielsweise findet `serv manag` „Service Management“. Bereich, Status und Labels begrenzen die Ergebnisse. Groß-/Kleinschreibung und Akzente werden normalisiert; `ß` und `ss` bleiben unterschiedliche Zeichen. Pro Seite erscheinen bis zu 50 Treffer.
- Auf einer Inhaltsseite zeigen **Versionen** die tatsächlich vorhandenen Versionen und Entwürfe. **Rohdaten** öffnet den unveränderten Inhaltsdatensatz, den dekodierten und ursprünglichen Body, Eigenschaften und gegebenenfalls den Datenbankexport.
- Bilder und PDFs lassen sich in der Anhangliste ansehen. Andere Dateitypen, insbesondere HTML und SVG, werden heruntergeladen. Ein fehlender Anhang wird ausdrücklich gekennzeichnet.
- Der **Backup-Bericht** nennt Datensatzzahlen, Importhinweise und belegte Exportgrenzen. Beschädigte ZIPs bleiben mit Fehlermeldung in der Auswahl; andere Backups sind weiterhin lesbar.

### Links zur Originalinstanz

Auf jeder Inhaltsseite bleibt oben eine Leiste für den **Original-Link** eingeblendet, auch beim Scrollen. Für Seiten mit bekannter Instanz zeigt sie die vollständige Confluence-Adresse und öffnet sie auf Wunsch in einem neuen Tab. Historische Versionen und Entwürfe verlinken ausdrücklich auf die Hauptseite. Externe Links werden niemals automatisch aufgerufen.

Das mitgelieferte ZIP enthält die Cloud-ID, aber keine Domain. In `backup-sites.json` ist deshalb die anhand des bestätigten Beispiels bekannte Zuordnung hinterlegt:

```json
{
  "63f38795-ddff-4fcf-91cf-8d3b260b767d": "https://sva-aldi-demo.atlassian.net"
}
```

Weitere bekannte Instanzen können über ihre Cloud-ID ergänzt werden; die Cloud-ID steht im Backup-Bericht. Die Zuordnung gilt auch für weitere Backups derselben Instanz. Alternativ werden vorhandene `siteUrl`-/`baseUrl`-Felder aus ZIP-Metadaten erkannt. Änderungen werden nach Neustart wirksam und benötigen keinen Cache-Neuaufbau. Fehlt eine bestätigte Adresse oder ein unterstütztes Linkformat für den Inhaltstyp, zeigt die Leiste dies ausdrücklich an. Links zu anderen Instanzen werden nicht aus beliebigen Verweisen im Seiteninhalt abgeleitet.

## Lizenz

Der Viewer einschließlich SSO-Code und Lizenzprüfung steht unter AGPL-3.0-only und ist öffentlich einsehbar. Im offiziellen Build benötigen SSO, Identitätsimport/-wechsel, nutzerbezogene Produktberechtigungen und Jira-Identitätszuordnungen einen gültigen Marketplace-Lizenzschlüssel (gegebenenfalls auch während eines dort angebotenen Testzeitraums). Globale Produktsichtbarkeit kann der lokale Admin auch ohne Lizenz einstellen. Lizenzen gibt es im [Atlassian Marketplace](https://marketplace.atlassian.com/apps/1045655402/backup-viewer-for-confluence?hosting=cloud&tab=overview).

ACP120 bietet Produktsupport nur für Kunden mit aktiver, bezahlter Marketplace-Lizenz. Die Lizenzeinnahmen finanzieren Wartung und Support einschließlich der dafür genutzten AI-Credits. Diese Produktbedingungen ändern nicht die AGPL-Lizenz des Quellcodes. Details zu den AGPL-Pflichten stehen in [LICENSING.md](LICENSING.md).

## Identitäten, Berechtigungen und SSO

Mit gültiger Lizenz verlangt für jeden Inhalt eine angemeldete Testidentität — wie eine Confluence-Data-Center-Instanz mit deaktiviertem anonymen Zugriff. Die Anwendung wertet die im Backup enthaltenen Berechtigungstabellen (`content_permissions`, `space_permissions`, `space_role_permissions`, `space_role_assignments`) gegen die angemeldete Testidentität aus. Ohne hinterlegte Berechtigungsdaten zu einem Bereich bleibt der Zugriff erlaubt, solange eine Identität angemeldet ist. Änderungen an SSO/SAML wirken sofort, ohne Neustart.

**Identitäten importieren:** Ein einmaliger Export aus Guard/Atlassian-Administration (CSV, beliebige gängige Spaltennamen wie `User id`/`User name`/`email`/`Group membership`) lässt sich entweder per `npm run import:identity -- <datei.csv>` einlesen, oder direkt über den Import-Knopf auf der **Einstellungsseite** hochladen. Importierte Identitäten liegen getrennt vom ZIP-Cache in `.cache/identity.sqlite` und bleiben über neue Backup-Importe hinweg erhalten.

**Testnutzer wechseln:** Das Dropdown neben dem Nutzer-Symbol in der Kopfzeile listet alle importierten Identitäten. Eine Auswahl setzt ein signiertes Sitzungs-Cookie und lädt die Seite neu, sodass sich Berechtigungen für die gewählte Identität sofort überprüfen lassen.

**Backend-Login und Einstellungsseite (`/settings`):** Ein Zahnrad-Symbol in der Kopfzeile führt zu einer Seite, auf der sich die SAML-Konfiguration, der Nutzerimport, das Benutzerverzeichnis und verwaiste Nutzer bearbeiten bzw. einsehen lassen, ohne die Anwendung neu zu starten. Der Zugriff ist über einen echten, von den Testidentitäten unabhängigen Admin-Login unter `/login` geschützt – wie beim Login-Bildschirm einer Confluence-Data-Center-Instanz. Beim allerersten Start wird ein lokales Admin-Konto mit den Zugangsdaten `admin` / `admin` angelegt; das Passwort muss vor der ersten Nutzung des Backends geändert werden. Das Konto liegt gehasht (scrypt) in `.cache/identity.sqlite`, getrennt von den importierten Testidentitäten.

Auf der Einstellungsseite listet **Benutzerverzeichnis** alle importierten Identitäten mit Suchfeld. **Verwaiste Nutzer** vergleicht die `user_mapping`-Einträge aller eingelesenen Backups gegen das importierte Verzeichnis und zeigt Nutzer, die im Backup referenziert werden, aber in keinem Import auftauchen.

Alle Einstellungen (außer dem Admin-Konto) landen in `settings.json` im Projektverzeichnis:

```json
{
  "saml": {
    "idpSsoUrl": "https://idp.example.com/sso/saml",
    "idpCert": "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----",
    "issuer": "confluence-backup-viewer",
    "callbackUrl": "http://localhost:3000/auth/saml/acs",
    "groupAttribute": "http://schemas.xmlsoap.org/claims/Group"
  },
  "licence": "eyJ2IjoxLCJjb21wYW55Ijoi…"
}
```

`saml` ist `null`, solange SSO nicht vollständig konfiguriert ist. Das Zertifikat ist öffentlich (kein privater Schlüssel) und kann bedenkenlos in der Einstellungsseite bearbeitet werden. Existiert beim allerersten Start noch keine `settings.json`, aber eine `saml-config.json` (siehe `saml-config.example.json`), wird diese einmalig übernommen; danach ist ausschließlich `settings.json` (bzw. die Einstellungsseite) maßgeblich.

**SAML SSO:** Sobald `saml` konfiguriert ist, stehen `/auth/saml/login` und `/auth/saml/acs` als Service-Provider-Routen bereit. Nach erfolgreicher Anmeldung wird die Identität automatisch in `.cache/identity.sqlite` übernommen (per NameID) und die Sitzung gesetzt.

## Cache und Originaldaten

Für jedes Backup entsteht unter `.cache/` eine eigene SQLite-Datei. Die Backup-ID wird aus dem vollständigen ZIP-Pfad abgeleitet; die Inhaltsadressen enthalten immer diese ID. Ein SHA-256-Fingerabdruck des gesamten ZIPs und die Importformat-Version entscheiden über die Wiederverwendung des Caches. Beim Neustart wird das ZIP dafür einmal gelesen, aber bei gültigem Cache nicht erneut importiert.

Der Import schreibt zunächst eine temporäre SQLite-Datei in einer Transaktion. Erst nach erfolgreichem Abschluss ersetzt sie den bisherigen Cache atomar. Schlägt ein neuer Import fehl, bleibt ein vorhandener Cache auf der Festplatte erhalten; veraltete Inhalte werden nicht als aktuelles Backup ausgegeben. Das ZIP wird niemals verändert oder vollständig entpackt. ZIP-Einträge, GZIP-Tabellen und CSV-Zeilen werden gestreamt. Dekodierte Bodies werden einzeln verarbeitet, mit maximal 64 MiB pro Body/CSV-Datensatz. Der kompakte Inhalts-/Versionsindex wird während des Imports im Arbeitsspeicher gehalten.

**Cache neu aufbauen:** Anwendung beenden, die betreffende `.cache/<Backup-ID>.sqlite` löschen und erneut `npm start` ausführen. Alternativ das gesamte generierte `.cache`-Verzeichnis entfernen. Backups nicht löschen. Ein Wechsel von `--cache-dir` erzeugt ebenfalls einen frischen Cache.

Anhänge werden über `FILESTORE_ID` ausschließlich einem validierten Eintrag `attachments/<ID>` zugeordnet und bei Bedarf direkt aus dem geöffneten ZIP gestreamt. IDs bleiben Strings, einschließlich Werten oberhalb der sicheren JavaScript-Ganzzahlgrenze. `prevver` verweist in diesem Export auf den Hauptdatensatz; historische Zeilen mit Status `current` werden daher nicht zusätzlich als veröffentlichte Seiten gezählt.

## Darstellungsumfang und Grenzen

Unterstützt werden Seiten, Blogposts, Ordner, Kommentare/Antworten, Labels, Autorenkennungen, Anhangmetadaten und Versionsbeziehungen. Vorhandene Benutzernamen aus `user_mapping` werden angezeigt; fehlt ein Name, bleibt die Kennung sichtbar. Berechtigungen werden bewusst nicht ausgewertet. Technische Tabellen, benutzerdefinierte Eigenschaften und Vorlagen werden nicht als reguläre Seiten aufgeführt.

Die Umwandlung unterstützt Confluence-Storage-HTML mit Spaltenlayouts, Tabellen, lokalen Bildern, Aufgabenlisten, Code, Panels, Status, Expand-Bereichen, Inhaltsverzeichnissen, Erwähnungen und grundlegenden ADF-Erweiterungen. Interne Seitenlinks werden über ID beziehungsweise Titel und Bereich, Anhanglinks über zugehörige Seite und Dateiname aufgelöst. Anker bleiben lokal. Nicht zuordenbare Ziele werden markiert. Nicht im Backup enthaltene externe Bilder werden nicht nachgeladen; vorhandene Quelllinks können bewusst geöffnet werden.

Lokale Makros umfassen Unterseiten, Labels, Bereichssuche, zuletzt geänderte Inhalte, Blogposts, Inhalte nach Labels, Seitenberichte, Seiteneigenschaften, gespeicherte Einbindungen/Auszüge und Anhanglinks. Unterstützte CQL-Filter sind `label`, `space` und `type` mit `=` oder `in (...)`, verbunden durch `and`; zusätzlich `space = currentSpace()`. Andere CQL-Ausdrücke werden mit Hinweis und Originalparametern angezeigt. Lokale Listen sind auf maximal 200 Ergebnisse begrenzt. Einbindungen sind gegen Zyklen geschützt und auf vier Ebenen begrenzt.

Unbekannte Makros und externe Funktionen (z. B. Jira, Roadmaps und eingebettete Dienste) erscheinen mit Makroname, Parametern und gespeichertem Inhalt. Es werden keine Live-Daten abgefragt oder fehlende Inhalte ergänzt. Exportierte HTML-Formulare, Skripte und aktive Einbettungen werden entfernt. Vollständige Confluence-Editor-/App-Kompatibilität, Rich-Text-Diffs und externe Integrationen sind nicht Bestandteil des Viewers.

Datenbankexporte mit Einträgen werden als Tabelle aus exportierten Feldern und Werten angezeigt; komplexe Zellwerte bleiben als JSON lesbar. Leere oder fehlende Exporte werden ausdrücklich gekennzeichnet. Ein generischer Whiteboard-Renderer ist nicht enthalten; vorhandene Rohdaten bleiben lesbar.

**Nachgewiesen im mitgelieferten ZIP:**

| Daten | Anzahl |
|---|---:|
| Bereiche | 19 |
| Inhaltsdatensätze einschließlich technischer Inhalte und Historie | 4.108 |
| Body-Datensätze | 3.736 |
| Zugeordnete Anhangdateien | 302 |
| Aktuelle veröffentlichte Inhalte der sichtbaren Typen | 626 |
| Historische Versionen der sichtbaren Typen, ohne Entwürfe | 481 |
| Leere Datenbankexporte | 14 |
| Whiteboard-Datensätze ohne verwertbaren Board-Export | 2 |

Es gibt 303 Anhangdatensätze; für **2195923** fehlt die Datei im Archiv. Die 14 Datenbankexporte liegen im Verzeichnis `whiteboards/data/`, enthalten aber keine Einträge. Die abschließende Exportmarkierung `000000,1` wird erkannt und nicht als Datensatz behandelt.

## API und Absicherung

Alle Browser-Endpunkte erlauben nur `GET` und `HEAD`; Import und Cache-Aufbau erfolgen ausschließlich beim Start. Ein Host-/Origin-Check begrenzt den Zugriff auf den lokalen Ursprung. Umgewandeltes HTML wird über eine Positivliste bereinigt; eine Content Security Policy verhindert Skripte und automatisch geladene externe Ressourcen. Dateipfade des Rechners können nicht über die API angefordert werden.

| Endpunkt | Zweck |
|---|---|
| `/api/backups` | Backups einschließlich Importfehlern |
| `/api/backups/:backup/spaces` | Bereiche |
| `/api/backups/:backup/tree?space=…&status=…` | Inhaltsbaum |
| `/api/backups/:backup/search?q=…&space=…&status=…&label=…&offset=…` | Volltextsuche/zuletzt geändert |
| `/api/backups/:backup/content/:id` | Inhalt und zugehörige Daten |
| `/api/backups/:backup/content/:id/versions` | Vorhandene Versionen |
| `/api/backups/:backup/content/:id/raw` | Rohdaten |
| `/api/backups/:backup/attachments/:id` | Datei; `?download` erzwingt Download |
| `/api/backups/:backup/report` | Importbericht |

## Entwicklung und Prüfung

```sh
npm test
npm run build
npm run test:browser
```

Die `node:test`-Tests prüfen CSV-Sonderfälle, Base64/Zstandard, Versionszuordnung, Suchtext, lokale CQL-Filter, interne Links, HTML-Bereinigung, Archivpfade, Cache-Wiederverwendung, atomaren Fehlerfall und zwei Backups mit gleichen IDs.

Die Playwright-Prüfung benötigt lokal installiertes **Google Chrome**. Sie startet ihren eigenen Server auf Port 3001, erzeugt kleine Testbackups in `.cache/browser-backups` und prüft zusätzlich das echte ZIP, falls es im Projektverzeichnis vorhanden ist. Geprüft werden Backup-Wechsel, Seitenbaum, Suche, Filter, Layouts, Makros, Kommentare, Versionen, Rohdaten, Anhangdownloads, HTTP-Absicherung, Tastaturbedienung und mobiles Layout. Im Offline-Test werden sämtliche externen Browseranfragen blockiert und als Fehler gewertet. Screenshots liegen unter `test-results/`.

Für Frontend-Entwicklung zuerst den API-Server mit `npm start` starten, dann in einem zweiten Terminal `npm run dev`. Vite leitet `/api` an den lokalen Server weiter. Produktionsbetrieb erfolgt ausschließlich über `npm start`.
