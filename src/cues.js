// Voiceover timing. Every animation beat is keyed to these cues, so the whole
// piece re-flows when they change.
//
// start / end : seconds from the start of the segment where the line is spoken.
// marks       : where key words fall inside the line, as a 0-1 fraction of
//               (end - start). They scale automatically when start/end change.
//
// The defaults are estimates for a ~174 wpm read (tools/estimate_cues.py).
// Once the voiceover is recorded, replace start/end with the real times
// (open the preview, load the audio, and read the times off the scrubber).
window.CUES = [
  { id: 'interrupt', start: 0.35, end: 2.68, marks: { future: 0.70 },
    text: 'Quick interruption from my future self' },
  { id: 'sponsor', start: 2.80, end: 6.28, marks: { present: 0.07, sponsor: 0.53 },
    text: 'to present you a very nice sponsor for this video' },
  { id: 'podcast', start: 6.40, end: 9.66, marks: { podcast: 0.50, years: 0.79 },
    text: 'and one that I had on the podcast a few years ago,' },
  { id: 'llamaindex', start: 9.76, end: 10.69, marks: {},
    text: 'LlamaIndex.' },
  { id: 'rag', start: 11.09, end: 12.95, marks: { rag: 0.62 },
    text: 'Yes, the very same RAG framework' },
  { id: 'jerry', start: 13.03, end: 17.45, marks: { Jerry: 0.16, founder: 0.37, podcast: 0.58, twenty: 0.74 },
    text: 'where I had Jerry Liu, the founder, on my podcast in 2023.' },
  { id: 'except', start: 17.85, end: 20.17, marks: { Lama: 0.70 },
    text: "Except now it's all about LlamaParse," },
  { id: 'ocr', start: 20.25, end: 21.88, marks: { agentic: 0.14 },
    text: 'their agentic OCR.' },
  { id: 'episode', start: 22.28, end: 25.07, marks: { Jerry: 0.83 },
    text: 'In the episode I recorded with Jerry,' },
  { id: 'pdfs', start: 25.19, end: 29.61, marks: { P: 0.21, problem: 0.58, long: 0.89 },
    text: 'I told him that PDFs would remain a problem for a very long time,' },
  { id: 'pipeline', start: 29.76, end: 33.95, marks: { powerful: 0.33, pipeline: 0.67 },
    text: "and now they built the most powerful OCR pipeline I've ever seen." },
  { id: 'personal', start: 34.55, end: 37.57, marks: { personally: 0.69 },
    text: 'I guess they might have took that a bit personally.' },
  { id: 'route', start: 37.97, end: 41.23, marks: { tables: 0.29, charts: 0.43, scans: 0.57, right: 0.79 },
    text: 'LlamaParse sends tables, charts, and scans to the right model' },
  { id: 'trace', start: 41.31, end: 44.33, marks: { every: 0.31, source: 0.92 },
    text: 'and then traces every value back to its source.' },
  { id: 'bench', start: 44.73, end: 46.13, marks: { benchmark: 0.67 },
    text: 'On their open benchmark,' },
  { id: 'top', start: 46.21, end: 49.23, marks: { top: 0.38, fraction: 0.62 },
    text: 'it comes out on top for a fraction of the cost.' },
  { id: 'code', start: 49.63, end: 51.72, marks: { summer: 0.33 },
    text: 'Use the code SUMMERGIFT26' },
  { id: 'credits', start: 51.80, end: 54.59, marks: { two: 0.08, free: 0.75 },
    text: 'for $250 in free credits' },
  { id: 'half', start: 54.69, end: 57.25, marks: { half: 0.09, three: 0.45 },
    text: 'and half off your first three months of subscription' },
  { id: 'upgrade', start: 57.33, end: 59.42, marks: { upgrade: 0.22, thirty: 0.67 },
    text: 'if you upgrade within 30 days.' },
  { id: 'link', start: 60.02, end: 63.74, marks: { first: 0.44, description: 0.69, below: 0.88 },
    text: 'Check out LlamaParse with the first link in the description below,' },
  { id: 'team', start: 63.86, end: 67.35, marks: { friend: 0.33, Jerry: 0.40, amazing: 0.73 },
    text: 'and go support my friend Jerry Liu and his amazing team.' },
  { id: 'october', start: 67.75, end: 70.31, marks: { whole: 0.55, October: 0.64 },
    text: 'The offer stands for the whole October month.' },
  { id: 'back', start: 70.71, end: 72.80, marks: { back: 0.33 },
    text: "Now, let's get back to the video." },
];

// Seconds of picture after the last line (ends on black for a clean cut).
window.TAIL = 0.6;
