import axios from 'axios';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import { r2Service } from './r2.service';

class FileService {
  private readonly MAX_CHARS = 20000; // Limit per file to prevent context bloat and slow AI response

  async extractText(url: string, fileName: string): Promise<string> {
    try {
      console.log(`Extracting text from: ${fileName} (${url})`);
      
      // If URL is already a public link, axios will handle it.
      // If the bucket is private, this might fail with 403.
      const response = await axios.get(url, { 
        responseType: 'arraybuffer',
        timeout: 60000 // 60s timeout for stability
      });

      const buffer = Buffer.from(response.data);
      const extension = fileName.split('.').pop()?.toLowerCase();

      let text = '';
      switch (extension) {
        case 'pdf':
          text = await this.parsePdf(buffer);
          break;
        case 'docx':
          text = await this.parseDocx(buffer);
          break;
        case 'txt':
        case 'json':
        case 'js':
        case 'ts':
        case 'tsx':
        case 'html':
        case 'css':
        case 'md':
          text = buffer.toString('utf-8');
          break;
        case 'ipynb':
          text = this.parseIpynb(buffer);
          break;
        default:
          text = buffer.toString('utf-8');
      }

      if (text.length > this.MAX_CHARS) {
        console.log(`Truncating ${fileName} from ${text.length} to ${this.MAX_CHARS} characters.`);
        text = text.slice(0, this.MAX_CHARS) + `... [TRUNCATED - File too large]`;
      }

      return text || '[Empty File]';
    } catch (error: any) {
      console.error(`Error extracting text from ${fileName}:`, error.response?.status || error.message);
      if (error.response?.status === 403) {
        return `[Access Denied: The document storage bucket may not be public. Please check R2 configuration.]`;
      }
      return `[Error extracting text from ${fileName}: ${error.message}]`;
    }
  }

  private async parsePdf(buffer: Buffer): Promise<string> {
    try {
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      const result = await parser.getText();
      // Clean up whitespace
      return result.text.replace(/\s+/g, ' ').trim();
    } catch (error: any) {
      console.error('PDF Parse Error:', error.message);
      return '[Failed to parse PDF content]';
    }
  }

  private parseIpynb(buffer: Buffer): string {
    try {
      const data = JSON.parse(buffer.toString('utf-8'));
      let text = '';
      if (data.cells && Array.isArray(data.cells)) {
        for (const cell of data.cells) {
          if (cell.cell_type === 'markdown' || cell.cell_type === 'code') {
            const source = Array.isArray(cell.source) ? cell.source.join('') : cell.source;
            text += `\n--- ${cell.cell_type} ---\n${source}\n`;
          }
        }
      }
      return text || '[Empty Notebook]';
    } catch (error: any) {
      console.error('IPYNB Parse Error:', error.message);
      return '[Failed to parse IPYNB content]';
    }
  }

  private async parseDocx(buffer: Buffer): Promise<string> {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } catch (error) {
      console.error('DOCX Parse Error:', error);
      return '[Failed to parse DOCX]';
    }
  }
}

export const fileService = new FileService();
