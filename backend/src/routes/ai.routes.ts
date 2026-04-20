import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { tierCheckMiddleware } from '../middleware/tierCheck';
import { aiService } from '../services/ai.service';
import { ApiKeyService } from '../services/apiKey.service';
import multer from 'multer';
import fs from 'fs';

const router = Router();
const upload = multer({ dest: 'uploads/' });

// Streaming Chat Completion
router.post('/chat', authMiddleware, tierCheckMiddleware, async (req: any, res) => {
  try {
    const { messages, model } = req.body;
    const userId = req.user.id;

    // Get API key with user overrides
    const nvidiaApiKey = await ApiKeyService.getUserApiKey(userId, 'nvidia');
    
    if (!nvidiaApiKey) {
      return res.status(400).json({ 
        success: false, 
        message: 'NVIDIA API Key not found. Please add it in settings.' 
      });
    }

    // Set headers for streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const stream = await aiService.streamChat(nvidiaApiKey, messages, model);

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error: any) {
    console.error('AI Stream Error:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: error.message });
    } else {
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    }
  }
});

// Image Generation
router.post('/image', authMiddleware, tierCheckMiddleware, async (req: any, res) => {
  try {
    const { prompt, model } = req.body;
    const userId = req.user.id;

    const nvidiaApiKey = await ApiKeyService.getUserApiKey(userId, 'nvidia');

    if (!nvidiaApiKey) {
      return res.status(400).json({ 
        success: false, 
        message: 'NVIDIA API Key not found. Please add it in settings.' 
      });
    }

    const result = await aiService.generateImage(nvidiaApiKey, prompt, model);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Voice Transcription
router.post('/voice', authMiddleware, upload.single('file'), async (req: any, res) => {
  try {
    const file = req.file;
    const userId = req.user.id;

    if (!file) {
      return res.status(400).json({ success: false, message: 'Audio file is required' });
    }

    const deepgramApiKey = await ApiKeyService.getUserApiKey(userId, 'deepgram');

    if (!deepgramApiKey) {
      return res.status(400).json({ 
        success: false, 
        message: 'Deepgram API Key not found. Please add it in settings.' 
      });
    }

    console.log(`Processing voice transcription: ${file.originalname} (${file.size} bytes, ${file.mimetype})`);

    const result = await aiService.transcribeAudio(deepgramApiKey, file.path);

    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Transcription Route Error:', error.response?.data || error.message);
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    
    const status = error.response?.status || 500;
    const message = error.response?.data?.message || error.message || 'Internal Server Error';
    
    res.status(status).json({ success: false, message });
  }
});

// Save API Key
router.post('/save-api-key', authMiddleware, async (req: any, res) => {
  try {
    const { provider, key } = req.body;
    const userId = req.user.id;

    if (!provider || !key) {
      return res.status(400).json({ success: false, message: 'Provider and key are required' });
    }

    const success = await ApiKeyService.saveUserApiKey(userId, provider, key);
    
    if (success) {
      res.json({ success: true, message: 'API Key saved successfully' });
    } else {
      res.status(500).json({ success: false, message: 'Failed to save API key' });
    }
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Text to Speech
router.post('/tts', authMiddleware, async (req: any, res) => {
  try {
    const { text, model } = req.body;
    const userId = req.user.id;

    if (!text) {
      return res.status(400).json({ success: false, message: 'Text is required' });
    }

    const deepgramApiKey = await ApiKeyService.getUserApiKey(userId, 'deepgram');

    if (!deepgramApiKey) {
      return res.status(400).json({ 
        success: false, 
        message: 'Deepgram API Key not found. Please add it in settings.' 
      });
    }

    const stream: any = await aiService.generateSpeech(deepgramApiKey, text, model);
    
    // Set response headers for audio stream
    res.setHeader('Content-Type', 'audio/mpeg');
    
    // Pipe the stream to the res
    stream.pipe(res);
  } catch (error: any) {
    console.error('TTS Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
