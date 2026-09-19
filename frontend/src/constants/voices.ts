export interface GeminiVoice {
  id: string;
  name: string;
  tone: string;
  previewUrl: string;
  cdnUrl: string;
}

export const DEFAULT_LIVE_VOICE = 'Zephyr';

export const GEMINI_LIVE_VOICES: GeminiVoice[] = [
  { id: 'Zephyr', name: 'Zephyr', tone: 'Bright, Higher pitch', previewUrl: '/voices/Zephyr.wav', cdnUrl: 'https://www.gstatic.com/aistudio/voices/samples/Zephyr.wav' },
  { id: 'Puck', name: 'Puck', tone: 'Upbeat, Middle pitch', previewUrl: '/voices/Puck.wav', cdnUrl: 'https://www.gstatic.com/aistudio/voices/samples/Puck.wav' },
  { id: 'Charon', name: 'Charon', tone: 'Informative, Lower pitch', previewUrl: '/voices/Charon.wav', cdnUrl: 'https://www.gstatic.com/aistudio/voices/samples/Charon.wav' },
  { id: 'Kore', name: 'Kore', tone: 'Firm, Middle pitch', previewUrl: '/voices/Kore.wav', cdnUrl: 'https://www.gstatic.com/aistudio/voices/samples/Kore.wav' },
  { id: 'Fenrir', name: 'Fenrir', tone: 'Excitable, Lower middle pitch', previewUrl: '/voices/Fenrir.wav', cdnUrl: 'https://www.gstatic.com/aistudio/voices/samples/Fenrir.wav' },
  { id: 'Aoede', name: 'Aoede', tone: 'Breezy, Middle pitch', previewUrl: '/voices/Aoede.wav', cdnUrl: 'https://www.gstatic.com/aistudio/voices/samples/Aoede.wav' },
  { id: 'Leda', name: 'Leda', tone: 'Youthful, Higher pitch', previewUrl: '/voices/Leda.wav', cdnUrl: 'https://www.gstatic.com/aistudio/voices/samples/Leda.wav' },
  { id: 'Orus', name: 'Orus', tone: 'Firm, Lower pitch', previewUrl: '/voices/Orus.wav', cdnUrl: 'https://www.gstatic.com/aistudio/voices/samples/Orus.wav' },
  { id: 'Despina', name: 'Despina', tone: 'Smooth, Middle pitch', previewUrl: '/voices/Despina.wav', cdnUrl: 'https://www.gstatic.com/aistudio/voices/samples/Despina.wav' },
  { id: 'Erinome', name: 'Erinome', tone: 'Clear, Higher pitch', previewUrl: '/voices/Erinome.wav', cdnUrl: 'https://www.gstatic.com/aistudio/voices/samples/Erinome.wav' },
  { id: 'Iapetus', name: 'Iapetus', tone: 'Clear, Lower pitch', previewUrl: '/voices/Iapetus.wav', cdnUrl: 'https://www.gstatic.com/aistudio/voices/samples/Iapetus.wav' },
  { id: 'Enceladus', name: 'Enceladus', tone: 'Breathy, Lower pitch', previewUrl: '/voices/Enceladus.wav', cdnUrl: 'https://www.gstatic.com/aistudio/voices/samples/Enceladus.wav' },
  { id: 'Achernar', name: 'Achernar', tone: 'Soft, Higher pitch', previewUrl: '/voices/Achernar.wav', cdnUrl: 'https://www.gstatic.com/aistudio/voices/samples/Achernar.wav' },
  { id: 'Achird', name: 'Achird', tone: 'Friendly, Middle pitch', previewUrl: '/voices/Achird.wav', cdnUrl: 'https://www.gstatic.com/aistudio/voices/samples/Achird.wav' },
  { id: 'Algenib', name: 'Algenib', tone: 'Gravelly, Lower pitch', previewUrl: '/voices/Algenib.wav', cdnUrl: 'https://www.gstatic.com/aistudio/voices/samples/Algenib.wav' },
  { id: 'Algieba', name: 'Algieba', tone: 'Smooth, Lower pitch', previewUrl: '/voices/Algieba.wav', cdnUrl: 'https://www.gstatic.com/aistudio/voices/samples/Algieba.wav' },
  { id: 'Alnilam', name: 'Alnilam', tone: 'Firm, Lower pitch', previewUrl: '/voices/Alnilam.wav', cdnUrl: 'https://www.gstatic.com/aistudio/voices/samples/Alnilam.wav' },
  { id: 'Autonoe', name: 'Autonoe', tone: 'Bright, Higher pitch', previewUrl: '/voices/Autonoe.wav', cdnUrl: 'https://www.gstatic.com/aistudio/voices/samples/Autonoe.wav' },
  { id: 'Callirrhoe', name: 'Callirrhoe', tone: 'Easy-going, Higher pitch', previewUrl: '/voices/Callirrhoe.wav', cdnUrl: 'https://www.gstatic.com/aistudio/voices/samples/Callirrhoe.wav' },
  { id: 'Gacrux', name: 'Gacrux', tone: 'Mature, Lower pitch', previewUrl: '/voices/Gacrux.wav', cdnUrl: 'https://www.gstatic.com/aistudio/voices/samples/Gacrux.wav' },
  { id: 'Laomedeia', name: 'Laomedeia', tone: 'Upbeat, Higher pitch', previewUrl: '/voices/Laomedeia.wav', cdnUrl: 'https://www.gstatic.com/aistudio/voices/samples/Laomedeia.wav' },
  { id: 'Pulcherrima', name: 'Pulcherrima', tone: 'Forward, Middle pitch', previewUrl: '/voices/Pulcherrima.wav', cdnUrl: 'https://www.gstatic.com/aistudio/voices/samples/Pulcherrima.wav' },
  { id: 'Rasalgethi', name: 'Rasalgethi', tone: 'Informative, Middle pitch', previewUrl: '/voices/Rasalgethi.wav', cdnUrl: 'https://www.gstatic.com/aistudio/voices/samples/Rasalgethi.wav' },
  { id: 'Sadachbia', name: 'Sadachbia', tone: 'Lively, Higher pitch', previewUrl: '/voices/Sadachbia.wav', cdnUrl: 'https://www.gstatic.com/aistudio/voices/samples/Sadachbia.wav' },
  { id: 'Sadaltager', name: 'Sadaltager', tone: 'Knowledgeable, Lower pitch', previewUrl: '/voices/Sadaltager.wav', cdnUrl: 'https://www.gstatic.com/aistudio/voices/samples/Sadaltager.wav' },
  { id: 'Schedar', name: 'Schedar', tone: 'Even, Middle pitch', previewUrl: '/voices/Schedar.wav', cdnUrl: 'https://www.gstatic.com/aistudio/voices/samples/Schedar.wav' },
  { id: 'Sulafat', name: 'Sulafat', tone: 'Warm, Lower pitch', previewUrl: '/voices/Sulafat.wav', cdnUrl: 'https://www.gstatic.com/aistudio/voices/samples/Sulafat.wav' },
  { id: 'Umbriel', name: 'Umbriel', tone: 'Easy-going, Lower pitch', previewUrl: '/voices/Umbriel.wav', cdnUrl: 'https://www.gstatic.com/aistudio/voices/samples/Umbriel.wav' },
  { id: 'Vindemiatrix', name: 'Vindemiatrix', tone: 'Gentle, Middle pitch', previewUrl: '/voices/Vindemiatrix.wav', cdnUrl: 'https://www.gstatic.com/aistudio/voices/samples/Vindemiatrix.wav' },
  { id: 'Zubenelgenubi', name: 'Zubenelgenubi', tone: 'Casual, Lower pitch', previewUrl: '/voices/Zubenelgenubi.wav', cdnUrl: 'https://www.gstatic.com/aistudio/voices/samples/Zubenelgenubi.wav' },
];
