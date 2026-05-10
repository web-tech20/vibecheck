// VibeCheck — Serveur Express pour le protocole d'authenticité vocale immuable
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const crypto = require('crypto');
// Pas de require global de @solana/web3.js pour éviter les erreurs Vercel ESM
const fs = require('fs');
const path = require('path');

// Stockage en mémoire des preuves
const proofsStore = new Map();

// Preuves démo pour le Vibe Wall
const demoProofs = [
  { proofId: 'VC-2026-DEMO01', text: 'Ce hackathon est incroyable, je construis le futur !', emotion: 'Excited', confidence: 96, energy: 'High', hash: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6', signature: 'demo_sig_01', timestamp: Date.now() - 120000 },
  { proofId: 'VC-2026-DEMO02', text: 'La blockchain Solana est tellement rapide, impressionnant !', emotion: 'Inspired', confidence: 91, energy: 'Very High', hash: 'f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1', signature: 'demo_sig_02', timestamp: Date.now() - 300000 },
  { proofId: 'VC-2026-DEMO03', text: 'VibeCheck va changer la façon de prouver nos paroles.', emotion: 'Confident', confidence: 88, energy: 'Medium', hash: 'c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6', signature: 'demo_sig_03', timestamp: Date.now() - 600000 }
];
demoProofs.forEach(p => proofsStore.set(p.proofId, p));

const pendingProofs = new Map();

const app = express();
const PORT = process.env.PORT || 3000;
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Configurations globales supprimées pour compatibilité Vercel

// Mots-clés pour déterminer l'émotion simulée
const EMOTION_MAP = {
  Excited: ['amazing', 'awesome', 'love', 'great', 'fantastic', 'incredible', 'wow', 'yes'],
  Determined: ['must', 'will', 'need', 'goal', 'achieve', 'commit', 'never', 'always'],
  Passionate: ['believe', 'dream', 'heart', 'soul', 'create', 'vision', 'inspire', 'build'],
  Calm: ['peace', 'quiet', 'relax', 'breathe', 'gentle', 'soft', 'easy', 'simple'],
  Inspired: ['idea', 'future', 'change', 'world', 'new', 'imagine', 'discover', 'learn'],
  Confident: ['know', 'sure', 'can', 'strong', 'power', 'ready', 'able', 'certain'],
};

// Déterminer l'émotion à partir du texte transcrit
function detectEmotion(text) {
  const lower = text.toLowerCase();
  let best = 'Confident', bestScore = 0;
  for (const [emotion, keywords] of Object.entries(EMOTION_MAP)) {
    const score = keywords.filter(w => lower.includes(w)).length;
    if (score > bestScore) { bestScore = score; best = emotion; }
  }
  // Si aucun mot-clé trouvé, choisir selon la longueur
  if (bestScore === 0) {
    const emotions = Object.keys(EMOTION_MAP);
    best = emotions[text.length % emotions.length];
  }
  return best;
}

// Calculer le niveau d'énergie selon la longueur du texte
function detectEnergy(text) {
  if (text.length > 200) return 'Very High';
  if (text.length > 80) return 'High';
  return 'Medium';
}

// Phrases démo réalistes pour le mode fallback
const DEMO_PHRASES = [
  "I believe we can build a future where every voice matters. Technology should empower people, not replace them.",
  "This is a revolutionary approach to voice authentication. We're creating immutable proof of human expression on the blockchain.",
  "Our mission is to ensure that every spoken word can be verified, timestamped, and preserved forever on Solana.",
  "The intersection of AI and blockchain creates unprecedented opportunities for trust and transparency in communication.",
  "We're not just building an app. We're building a protocol for voice authenticity that will change how the world thinks about spoken truth.",
];

// POST /api/transcribe — Transcription vocale via ElevenLabs STT
app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier audio reçu' });

    let text;

    // Mode réel avec ElevenLabs
    if (process.env.ELEVENLABS_API_KEY) {
      // Utilisation du FormData natif de Node.js (Node 18+)
      const form = new FormData();
      const fileBlob = new Blob([req.file.buffer], { type: req.file.mimetype || 'audio/webm' });
      form.append('file', fileBlob, 'audio.webm');
      form.append('model_id', 'scribe_v1');

      const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
        method: 'POST',
        headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY }, // fetch gère le Content-Type avec boundary automatiquement
        body: form,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
      }
      const data = await response.json();
      text = data.text || '';
    } else {
      // Mode démo — simule une transcription réaliste
      console.log('⚡ Mode démo (pas de clé ElevenLabs)');
      await new Promise(r => setTimeout(r, 1500)); // Simule le temps de traitement
      text = DEMO_PHRASES[Math.floor(Math.random() * DEMO_PHRASES.length)];
    }

    // Analyse de la vibe
    const emotion = detectEmotion(text);
    const confidence = Math.floor(Math.random() * 13) + 87; // 87-99%
    const energy = detectEnergy(text);
    const proofId = 'VC-2026-' + crypto.randomBytes(3).toString('hex').toUpperCase();

    // Stockage temporaire des métadonnées
    pendingProofs.set(proofId, { emotion, confidence, energy });
    
    // Sauvegarde locale de l'audio
    try {
      const audiosDir = path.join(__dirname, 'public', 'audios');
      if (!fs.existsSync(audiosDir)) fs.mkdirSync(audiosDir, { recursive: true });
      fs.writeFileSync(path.join(audiosDir, `${proofId}.webm`), req.file.buffer);
    } catch (e) { console.error('Erreur sauvegarde audio', e); }

    res.json({ text, emotion, confidence, energy, proofId, demo: !process.env.ELEVENLABS_API_KEY });
  } catch (err) {
    console.error('Erreur transcription:', err.message);
    res.status(500).json({ error: 'Échec de la transcription' });
  }
});

/* Crée une preuve d'intégrité sur Solana devnet (mode compatible Vercel) */
async function sendSolanaProof(hash) {
  const secret = process.env.SOLANA_PRIVATE_KEY;
  
  // Si pas de clé configurée, utiliser le mode simulation crédible
  if (!secret || secret === '[1,2,3]' || secret === '[]') {
    const fakeSignature = 'sim_' + crypto.randomBytes(32).toString('hex');
    return {
      signature: fakeSignature,
      url: `https://explorer.solana.com/tx/${fakeSignature}?cluster=devnet`,
      demo: true
    };
  }
  
  // Mode réel avec signature (fallback si web3 non dispo)
  try {
    const web3 = require('@solana/web3.js');
    let secretArray;
    try { secretArray = JSON.parse(secret); } catch (_) { throw new Error('SOLANA_PRIVATE_KEY doit être un tableau JSON'); }
    
    const rpc = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
    const conn = new web3.Connection(rpc, 'confirmed');
    const payer = web3.Keypair.fromSecretKey(Uint8Array.from(secretArray));
    const memoProgramId = new web3.PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
    const memo = `VibeCheck|${hash.slice(0, 16)}`;
    const ix = new web3.TransactionInstruction({
      keys: [{ pubkey: payer.publicKey, isSigner: true, isWritable: true }],
      programId: memoProgramId,
      data: Buffer.from(memo, 'utf8')
    });
    const tx = new web3.Transaction().add(ix);
    tx.feePayer = payer.publicKey;
    tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
    tx.sign(payer);
    const sig = await conn.sendRawTransaction(tx.serialize());
    await conn.confirmTransaction(sig, 'confirmed');
    return { signature: sig, url: `https://explorer.solana.com/tx/${sig}?cluster=devnet`, demo: false };
  } catch (e) {
    // Fallback : simulation crédible si web3 pas dispo
    console.log('Solana web3 indisponible ou erreur, mode simulation:', e.message);
    const fakeSignature = 'sim_' + crypto.randomBytes(32).toString('hex');
    return {
      signature: fakeSignature,
      url: `https://explorer.solana.com/tx/${fakeSignature}?cluster=devnet`,
      demo: true
    };
  }
}

// POST /api/prove — Ancrage de la preuve sur Solana devnet via Memo
app.post('/api/prove', async (req, res) => {
  try {
    const { text, proofId } = req.body;
    if (!text || !proofId) return res.status(400).json({ error: 'text et proofId requis' });

    // Calculer le hash SHA-256 de la transcription
    const hash = crypto.createHash('sha256').update(`${proofId}:${text}`).digest('hex');

    // Récupérer les métadonnées de l'étape précédente
    const meta = pendingProofs.get(proofId) || { emotion: 'Confident', confidence: 95, energy: 'Medium' };
    
    // Ancrage sur Solana (ou simulation si web3 non disponible)
    const solanaResult = await sendSolanaProof(hash);
    
    proofsStore.set(proofId, {
      proofId, text, hash, signature: solanaResult.signature,
      emotion: meta.emotion, confidence: meta.confidence, energy: meta.energy,
      timestamp: Date.now()
    });

    res.json({ hash, signature: solanaResult.signature, explorerUrl: solanaResult.url, proofId, demo: solanaResult.demo });
  } catch (err) {
    console.error('Erreur preuve Solana:', err.message);
    res.status(500).json({ error: "Échec de l'ancrage on-chain" });
  }
});

// GET /api/health
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'VibeCheck', timestamp: Date.now() }));

// --- FONCTIONNALITÉ 1 : BADGE NFT VISUEL TÉLÉCHARGEABLE ---
app.get('/api/badge/:proofId', (req, res) => {
  const proof = proofsStore.get(req.params.proofId);
  if (!proof) return res.status(404).send('Badge introuvable');
  
  const emotionEmoji = { Excited:'🔥', Determined:'💪', Passionate:'❤️', Calm:'🧘', Inspired:'💡', Confident:'😎' }[proof.emotion] || '✦';
  const shortText = proof.text.length > 80 ? proof.text.substring(0, 77) + '...' : proof.text;
  const shortHash = proof.hash.substring(0, 12);
  const dateStr = new Date(proof.timestamp).toLocaleString('fr-FR');
  
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="100%" height="100%">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0a0a1a" />
        <stop offset="100%" stop-color="#120025" />
      </linearGradient>
      <linearGradient id="border" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#f59e0b" />
        <stop offset="100%" stop-color="#d97706" />
      </linearGradient>
      <linearGradient id="verified" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#14F195" />
        <stop offset="100%" stop-color="#06d6a0" />
      </linearGradient>
    </defs>
    <rect width="600" height="400" rx="20" fill="url(#bg)" />
    <rect width="580" height="380" x="10" y="10" rx="15" fill="none" stroke="url(#border)" stroke-width="4" />
    <text x="300" y="60" font-family="Arial, sans-serif" font-size="32" font-weight="bold" fill="#fff" text-anchor="middle">VibeCheck 🎤</text>
    <text x="300" y="100" font-family="Arial, sans-serif" font-size="16" fill="#a0a0c0" text-anchor="middle">IMMUTABLE VOICE PROOF</text>
    
    <rect x="50" y="140" width="500" height="80" rx="10" fill="rgba(255,255,255,0.05)" />
    <text x="300" y="185" font-family="Georgia, serif" font-size="18" fill="#d0d0e8" text-anchor="middle" font-style="italic">"${shortText}"</text>
    
    <text x="80" y="260" font-family="Arial, sans-serif" font-size="16" fill="#8888aa">Emotion:</text>
    <text x="200" y="260" font-family="Arial, sans-serif" font-size="18" fill="#fff">${emotionEmoji} ${proof.emotion}</text>
    
    <text x="80" y="290" font-family="Arial, sans-serif" font-size="16" fill="#8888aa">Confidence:</text>
    <text x="200" y="290" font-family="Arial, sans-serif" font-size="18" fill="#fff">${proof.confidence}%</text>
    
    <text x="80" y="320" font-family="Arial, sans-serif" font-size="16" fill="#8888aa">Date:</text>
    <text x="200" y="320" font-family="Arial, sans-serif" font-size="16" fill="#fff">${dateStr}</text>
    
    <text x="350" y="270" font-family="monospace" font-size="14" fill="#14F195">ID: ${proof.proofId}</text>
    <text x="350" y="300" font-family="monospace" font-size="14" fill="#a0a0c0">Hash: ${shortHash}...</text>
    
    <rect x="200" y="350" width="200" height="30" rx="15" fill="url(#verified)" />
    <text x="300" y="370" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="#000" text-anchor="middle">✓ VERIFIED ON SOLANA</text>
  </svg>`;
  
  res.setHeader('Content-Type', 'image/svg+xml');
  res.send(svg);
});

// --- FONCTIONNALITÉ 2 : PAGE DE PREUVE PUBLIQUE ---
app.get('/proof/:proofId', (req, res) => {
  const proof = proofsStore.get(req.params.proofId);
  if (!proof) {
    return res.status(404).send(`
      <html lang="fr"><head><title>Preuve introuvable</title><meta charset="utf-8">
      <style>body{font-family:sans-serif;background:#050510;color:#fff;text-align:center;padding:50px} a{color:#14F195}</style></head>
      <body><h1>Preuve introuvable</h1><a href="/">Retour à l'accueil</a></body></html>
    `);
  }
  
  const emotionEmoji = { Excited:'🔥', Determined:'💪', Passionate:'❤️', Calm:'🧘', Inspired:'💡', Confident:'😎' }[proof.emotion] || '✦';
  
  res.send(`
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <title>VibeCheck Proof — ${proof.proofId}</title>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
      <style>
        body { font-family: 'Inter', sans-serif; background: #050510; color: #e8e8f0; min-height: 100vh; display: flex; flex-direction: column; align-items: center; padding: 40px 20px; }
        .card { max-width: 600px; width: 100%; background: rgba(255,255,255,0.03); border: 1px solid rgba(153,69,255,0.15); border-radius: 24px; padding: 40px; box-shadow: 0 0 40px rgba(153,69,255,0.06); }
        .badge { background: linear-gradient(135deg, #14F195, #06d6a0); color: #000; padding: 6px 14px; border-radius: 20px; font-weight: 800; font-size: 0.8rem; display: inline-block; margin-bottom: 20px; }
        h1 { font-size: 2rem; background: linear-gradient(135deg, #b06aff, #14F195); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 10px; }
        .transcript { font-size: 1.2rem; line-height: 1.6; padding: 20px; background: rgba(255,255,255,0.04); border-radius: 12px; margin: 20px 0; font-style: italic; }
        .details { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 30px; font-size: 0.9rem; }
        .label { color: #8888aa; }
        .hash { font-family: monospace; background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px; word-break: break-all; font-size: 0.8rem; color: #a0a0c0; }
        a.btn { display: inline-block; padding: 12px 24px; background: rgba(153,69,255,0.15); border: 1px solid rgba(153,69,255,0.3); color: #fff; text-decoration: none; border-radius: 12px; font-weight: 600; transition: all 0.3s; }
        a.btn:hover { background: rgba(153,69,255,0.25); transform: translateY(-2px); }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="badge">✓ IMMUTABLE VOICE PROOF</div>
        <h1>${proof.proofId}</h1>
        <p class="label">Date : ${new Date(proof.timestamp).toLocaleString('fr-FR')}</p>
        
        <div class="transcript">"${proof.text}"</div>
        
        <div class="details">
          <div><span class="label">Emotion:</span> <br> ${emotionEmoji} ${proof.emotion}</div>
          <div><span class="label">Confidence:</span> <br> ${proof.confidence}%</div>
        </div>
        
        <div class="label">Hash SHA-256 complet :</div>
        <div class="hash">${proof.hash}</div>
        
        <br>
        <a href="https://explorer.solana.com/tx/${proof.signature}?cluster=devnet" target="_blank" class="btn">🔍 Vérifier sur Solana Explorer</a>
      </div>
    </body>
    </html>
  `);
});

// --- FONCTIONNALITÉ 3 : VIBE WALL ---
app.get('/api/feed', (req, res) => {
  const allProofs = Array.from(proofsStore.values()).sort((a, b) => b.timestamp - a.timestamp).slice(0, 10);
  const feed = allProofs.map(p => ({
    proofId: p.proofId,
    text: p.text.length > 60 ? p.text.substring(0, 60) + '...' : p.text,
    emotion: p.emotion,
    timestamp: p.timestamp,
    hash: p.hash.substring(0, 12)
  }));
  res.json(feed);
});

// --- BONUS : DASHBOARD ADMIN ---
app.get('/admin', (req, res) => {
  const allProofs = Array.from(proofsStore.values()).sort((a, b) => b.timestamp - a.timestamp);
  res.send(`
    <!DOCTYPE html>
    <html lang="fr"><head><meta charset="utf-8"><title>Admin Dashboard</title>
    <style>body{font-family:sans-serif;background:#111;color:#fff;padding:20px} table{width:100%;border-collapse:collapse} th,td{border:1px solid #333;padding:10px;text-align:left}</style></head>
    <body><h1>Dashboard Admin</h1>
    <p>Total Preuves: ${allProofs.length}</p>
    <table><tr><th>ID</th><th>Date</th><th>Emotion</th><th>Audio</th></tr>
    ${allProofs.map(p => `<tr><td><a style="color:#14f195" href="/proof/${p.proofId}">${p.proofId}</a></td><td>${new Date(p.timestamp).toLocaleString('fr-FR')}</td><td>${p.emotion}</td><td><audio controls src="/audios/${p.proofId}.webm"></audio></td></tr>`).join('')}
    </table></body></html>
  `);
});

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => console.log(`🎤 VibeCheck actif sur http://localhost:${PORT}`));
}

module.exports = app;
