const fs = require('fs');
const path = require('path');

// Pfade auf dem VPS
const WORKSPACE_DIR = '/root/.openclaw/workspace-tareno';
const PROJECT_JSON_PATH = path.join(WORKSPACE_DIR, 'data/projects/tareno.json');
const MEDIA_DIR = path.join(WORKSPACE_DIR, 'media/notebooklm-audio/tareno');

if (!fs.existsSync(PROJECT_JSON_PATH)) {
    console.error('tareno.json nicht gefunden:', PROJECT_JSON_PATH);
    process.exit(1);
}

const data = JSON.parse(fs.readFileSync(PROJECT_JSON_PATH, 'utf8'));
let updatedCount = 0;

if (data.contentPipeline && Array.isArray(data.contentPipeline)) {
    data.contentPipeline.forEach((row, index) => {
        // Tag 01, 02...
        const rowId = row.id;

        // Wir suchen nach MP3-Dateien für diesen Tag im Media-Verzeichnis
        if (fs.existsSync(MEDIA_DIR)) {
            const files = fs.readdirSync(MEDIA_DIR);
            const mp3File = files.find(f => f.toLowerCase().startsWith(rowId.toLowerCase() + '-') && f.endsWith('.mp3'));

            if (mp3File) {
                const relPath = `media/notebooklm-audio/tareno/${mp3File}`;
                const absPath = path.join(MEDIA_DIR, mp3File);

                // Falls die NotebookLM Einträge fehlen oder leer sind, ergänzen wir sie
                if (!row.notebooklm || !row.notebooklm.lastAudioRelPath) {
                    row.notebooklm = row.notebooklm || {};
                    row.notebooklm.lastAudioRelPath = relPath;
                    row.notebooklm.lastAudioAbsPath = absPath;

                    // Ein paar Dummy-Werte setzen, damit die UI nicht abstürzt
                    row.notebooklm.lastGeneratedAt = row.notebooklm.lastGeneratedAt || new Date().toISOString();
                    row.notebooklm.notebookTitle = row.notebooklm.notebookTitle || `Tareno ${rowId} Audio`;

                    console.log(`✅ [${rowId}] Pfade in JSON repariert -> ${mp3File}`);
                    updatedCount++;
                } else {
                    // Schon vorhanden
                    console.log(`ℹ️ [${rowId}] Ist bereits korrekt in JSON verlinkt.`);
                }
            }
        }
    });
}

if (updatedCount > 0) {
    fs.writeFileSync(PROJECT_JSON_PATH, JSON.stringify(data, null, 2), 'utf8');
    console.log(`\n🎉 Erfolgreich ${updatedCount} Einträge in tareno.json aktualisiert.`);
    console.log('Starte nun das Admin-Dashboard via PM2/Systemd neu, falls nötig!');
} else {
    console.log('\nKeine Änderungen vorgenommen (Files fehlen oder JSON war schon aktuell).');
}
