//! piqi-tts — Piqi'nin açık kaynak Türkçe seslendirme yan süreci (EMA Lightning, cihaz üzerinde).
//!
//! Kullanım: piqi-tts <model klasörü>
//! stdin  (satır başına JSON): {"id":"s1","text":"Merhaba","speed":1.0,"out":"/tmp/s1.wav"}
//! stdout (satır başına JSON): {"event":"ready"} · {"event":"done","id":"s1","path":"…","seconds":1.2,"ms":45}
//!                            · {"event":"error","id":"s1","message":"…"}

use serde::Deserialize;
use serde_json::json;
use std::io::{self, BufRead, Write};
use std::path::Path;
use std::time::Instant;
use turkish_neural_tts::{ema, pronounce::Hints};

#[derive(Deserialize)]
struct Request {
    id: String,
    text: String,
    #[serde(default = "default_speed")]
    speed: f32,
    out: String,
}

fn default_speed() -> f32 {
    1.0
}

fn emit(value: serde_json::Value) {
    let mut stdout = io::stdout().lock();
    let _ = writeln!(stdout, "{value}");
    let _ = stdout.flush();
}

fn main() {
    let Some(dir) = std::env::args().nth(1) else {
        emit(json!({"event": "error", "message": "kullanım: piqi-tts <model klasörü>"}));
        std::process::exit(2);
    };
    let dir = Path::new(&dir);
    if !ema::installed(dir) {
        emit(json!({"event": "error", "message": "EMA model dosyaları bulunamadı"}));
        std::process::exit(3);
    }
    let started = Instant::now();
    let mut model = match ema::Ema::load(dir) {
        Ok(m) => m,
        Err(e) => {
            emit(json!({"event": "error", "message": e}));
            std::process::exit(4);
        }
    };
    emit(json!({"event": "ready", "loadMs": started.elapsed().as_millis() as u64, "sampleRate": ema::SAMPLE_RATE}));

    let hints = Hints::default();
    for line in io::stdin().lock().lines() {
        let Ok(line) = line else { break };
        if line.trim().is_empty() {
            continue;
        }
        let request: Request = match serde_json::from_str(&line) {
            Ok(r) => r,
            Err(e) => {
                emit(json!({"event": "error", "message": format!("geçersiz istek: {e}")}));
                continue;
            }
        };
        let t = Instant::now();
        match model.synthesize(&request.text, &hints, request.speed, None, &|_| {}) {
            Ok(audio) => {
                let seconds = audio.len() as f32 / ema::SAMPLE_RATE as f32;
                match std::fs::write(&request.out, ema::wav_bytes(&audio)) {
                    Ok(()) => emit(json!({
                        "event": "done", "id": request.id, "path": request.out,
                        "seconds": seconds, "ms": t.elapsed().as_millis() as u64
                    })),
                    Err(e) => emit(json!({"event": "error", "id": request.id, "message": e.to_string()})),
                }
            }
            Err(e) => emit(json!({"event": "error", "id": request.id, "message": e})),
        }
    }
}
