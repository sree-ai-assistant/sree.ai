import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { tierCheckMiddleware } from '../middleware/tierCheck';
import { aiService } from '../services/ai.service';
import { ApiKeyService } from '../services/apiKey.service';
import { r2Service } from '../services/r2.service';
import { fileService } from '../services/file.service';
import multer from 'multer';
import fs from 'fs';
import { TokenManager } from '../utils/tokenManager';
import { supabaseAdmin } from '../lib/supabase';

const router = Router();
const upload = multer({ dest: 'uploads/' });

// Streaming Chat Completion
router.post('/chat', authMiddleware, tierCheckMiddleware, async (req: any, res) => {
  try {
    const { messages, model, attachments, messageId } = req.body;
    const userId = req.user.id;

    // Set headers for streaming early
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // 1. Process incoming messages to include context from metadata for the AI
    // but keep it hidden from the UI (which uses the clean content)
    // 1. Shallow copy messages to avoid mutating the original array if needed
    let processedMessages = [...messages];

    if (attachments && attachments.length > 0) {
      const docAttachments = attachments.filter((a: any) => a.type === 'document');
      
      if (docAttachments.length > 0) {
        console.log(`[AI Route] Processing ${docAttachments.length} document attachments`);
        res.write(`data: ${JSON.stringify({ status: 'Preparing documents...' })}\n\n`);
        const startTime = Date.now();
        
        try {
          const results: { name: string, text: string }[] = [];
          const extractionPromises = docAttachments.map(async (doc: any) => {
            if (doc.extractedText) {
              console.log(`[AI Route] Using pre-extracted text for ${doc.name} (${doc.extractedText.length} chars)`);
              return { name: doc.name, text: doc.extractedText };
            }

            console.log(`[AI Route] Backend extraction starting for ${doc.name}`);
            res.write(`data: ${JSON.stringify({ status: `Reading ${doc.name}...` })}\n\n`);
            
            try {
              const text = await Promise.race([
                fileService.extractText(doc.url, doc.name),
                new Promise<string>((_, reject) => 
                  setTimeout(() => reject(new Error(`Timeout after 60s`)), 60000)
                )
              ]);
              
              const isSpreadsheet = ['xlsx', 'xls', 'xlsm', 'xlsb', 'ods', 'csv', 'tsv'].some(ext => doc.name.toLowerCase().endsWith(ext));
              const statusText = isSpreadsheet ? `Analyzing Sheets in ${doc.name}...` : `Processing ${doc.name}...`;
              res.write(`data: ${JSON.stringify({ status: statusText })}\n\n`);
              
              console.log(`[AI Route] Successfully extracted ${text.length} chars from ${doc.name}`);
              return { name: doc.name, text };
            } catch (err: any) {
              console.error(`[AI Route] Failed extracting ${doc.name}:`, err.message);
              return { name: doc.name, text: `[Extraction failed for ${doc.name}: ${err.message}]` };
            }
          });
          
          console.log(`[AI Route] Waiting for all extractions to complete...`);
          const extractionResults = await Promise.all(extractionPromises);
          results.push(...extractionResults);
          console.log(`[AI Route] Extraction phase complete. Total docs: ${results.length}`);
          
          res.write(`data: ${JSON.stringify({ status: 'Optimizing context for AI...' })}\n\n`);

          
          let contextText = "\n\n### CONTEXT FROM ATTACHED DOCUMENTS ###\n";
          contextText += "The user has provided the following documents as reference. Please analyze them and use the information to answer questions or perform requested tasks. If the documents contain data, refer to specific document names if relevant.\n\n";
          for (const result of results) {
            contextText += `#### DOCUMENT: ${result.name}\n`;
            contextText += `${result.text}\n`;
            contextText += `#### END OF ${result.name}\n\n`;
          }


          // Use TokenManager for truncation
          contextText = TokenManager.truncateDocumentText(contextText, 100000);
          contextText += "### END OF DOCUMENT CONTEXT ###\n\n";

          console.log(`[AI Route] Document processing completed in ${Date.now() - startTime}ms`);

          // Persist context to DB if messageId is provided
          // IMPORTANT: We store it in metadata.extractedContext instead of appending to content
          // so it remains hidden from the frontend UI.
          if (messageId) {
            console.log(`[AI Route] Persisting extracted context to message ${messageId} metadata`);
            try {
              const { data: currentMsg } = await supabaseAdmin
                .from('messages')
                .select('content, metadata')
                .eq('id', messageId)
                .single();
              
              if (currentMsg) {
                const updatedMetadata = { 
                  ...(currentMsg.metadata || {}), 
                  hasContext: true,
                  extractedContext: contextText
                };
                
                await supabaseAdmin
                  .from('messages')
                  .update({ 
                    metadata: updatedMetadata 
                  })
                  .eq('id', messageId);
                
                console.log(`[AI Route] Message ${messageId} metadata updated with context`);
              }
            } catch (dbError) {
              console.error('[AI Route] Error persisting context to DB:', dbError);
            }
          }

          // Update processedMessages with metadata so TokenManager/AiService see it
          const lastMessage = processedMessages[processedMessages.length - 1];
          if (lastMessage && lastMessage.role === 'user') {
            lastMessage.metadata = { 
              ...lastMessage.metadata, 
              extractedContext: contextText 
            };
          }
          
          res.write(`data: ${JSON.stringify({ extractedContext: contextText })}\n\n`);
          res.write(`data: ${JSON.stringify({ status: 'Thinking...' })}\n\n`);
        } catch (error) {
          console.error('[AI Route] Error during document extraction:', error);
          res.write(`data: ${JSON.stringify({ error: 'Failed to process some documents. Attempting to continue anyway...' })}\n\n`);
        }
      }
    }


    // Get API key with user overrides
    const nvidiaApiKey = await ApiKeyService.getUserApiKey(userId, 'nvidia');
    
    if (!nvidiaApiKey) {
      if (!res.headersSent) {
        return res.status(400).json({ 
          success: false, 
          message: 'NVIDIA API Key not found. Please add it in settings.' 
        });
      } else {
        res.write(`data: ${JSON.stringify({ error: 'NVIDIA API Key not found' })}\n\n`);
        res.end();
        return;
      }
    }

    // Optimize token usage by compressing history
    const optimizedMessages = TokenManager.compressMessages(processedMessages);

    const stream = await aiService.streamChat(nvidiaApiKey, optimizedMessages, model);

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

// File Upload to R2
router.post('/upload', authMiddleware, upload.single('file'), async (req: any, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const url = await r2Service.uploadFile(file.path, file.originalname, file.mimetype);
    
    // Cleanup temporary file
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);

    res.json({ success: true, url });
  } catch (error: any) {
    console.error('Upload Route Error:', error);
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ success: false, message: error.message });
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
