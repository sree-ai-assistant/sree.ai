import axios from 'axios';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';

class FileService {
  private readonly MAX_CHARS = 50000;
  private readonly DOWNLOAD_TIMEOUT = 15000; // 15 seconds timeout

  async extractText(url: string, fileName: string): Promise<string> {
    const extension = fileName.split('.').pop()?.toLowerCase();
    console.log(`[FileService] Starting extraction for ${fileName} (${extension})`);

    try {
      // Download the file with a timeout
      const response = await axios.get(url, { 
        responseType: 'arraybuffer',
        timeout: this.DOWNLOAD_TIMEOUT,
        headers: {
          'Accept': '*/*'
        }
      });
      
      const buffer = Buffer.from(response.data);
      console.log(`[FileService] Downloaded ${fileName}: ${buffer.length} bytes`);
      
      let text = '';

      switch (extension) {
        case 'pdf':
          console.log(`[FileService] Parsing PDF: ${fileName}`);
          text = await this.parsePdf(buffer);
          break;
        case 'docx':
          console.log(`[FileService] Parsing DOCX: ${fileName}`);
          text = await this.parseDocx(buffer);
          break;
        case 'xlsx':
        case 'xls':
        case 'xlsm':
        case 'xlsb':
        case 'csv':
        case 'tsv':
        case 'tab':
        case 'prn':
        case 'ods':
          console.log(`[FileService] Parsing Excel/Spreadsheet: ${fileName}`);
          const excelStart = Date.now();
          text = this.parseExcel(buffer);
          console.log(`[FileService] Excel parsed in ${Date.now() - excelStart}ms`);
          break;
        case 'txt':
        case 'md':
        case 'json':
        case 'js':
        case 'ts':
        case 'tsx':
        case 'css':
        case 'html':
        case 'py':
        case 'sql':
          console.log(`[FileService] Parsing Text file: ${fileName}`);
          text = buffer.toString('utf-8');
          break;
        default:
          console.log(`[FileService] Unknown extension ${extension}, attempting UTF-8 conversion`);
          text = buffer.toString('utf-8');
          // Basic check for binary content
          if (text.includes('\u0000')) {
            text = `[Binary file content for ${fileName} - Not readable as text]`;
          }
      }

      if (text.length > this.MAX_CHARS) {
        console.log(`[FileService] Truncating ${fileName} from ${text.length} to ${this.MAX_CHARS} chars`);
        text = text.slice(0, this.MAX_CHARS) + `\n... [TRUNCATED - File too large]`;
      }

      console.log(`[FileService] Successfully extracted ${text.length} chars from ${fileName}`);
      return text.trim() || `[No readable text found in ${fileName}]`;
    } catch (error: any) {
      console.error(`[FileService] Extraction Error for ${fileName}:`, error.message);
      if (error.code === 'ECONNABORTED') {
        return `[Error: Download timed out for ${fileName}]`;
      }
      return `[Error processing ${fileName}: ${error.message}]`;
    }
  }

  private async parsePdf(buffer: Buffer): Promise<string> {
    try {
      // Use require to avoid TS typing issues with pdf-parse
      const pdf = require('pdf-parse');
      const data = await pdf(buffer);
      return data.text || '';
    } catch (error: any) {
      console.error('PDF Parse Error:', error.message);
      return `[Failed to parse PDF content: ${error.message}]`;
    }
  }

  private async parseDocx(buffer: Buffer): Promise<string> {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return result.value || '';
    } catch (error: any) {
      console.error('DOCX Parse Error:', error.message);
      return `[Failed to parse DOCX content: ${error.message}]`;
    }
  }

  private parseExcel(buffer: Buffer): string {
    try {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      let text = '';
      
      workbook.SheetNames.forEach(sheetName => {
        const worksheet = workbook.Sheets[sheetName];
        if (worksheet) {
          text += `\nSheet: ${sheetName}\n`;
          text += XLSX.utils.sheet_to_csv(worksheet);
        }
      });
      
      return text;
    } catch (error: any) {
      console.error('Excel Parse Error:', error.message);
      return `[Failed to parse Excel content: ${error.message}]`;
    }
  }
}

export const fileService = new FileService();
