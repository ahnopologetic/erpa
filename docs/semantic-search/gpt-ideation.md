Let’s explore this! I’ll start by researching Chrome’s Prompt API and identify any known compatibility issues with Plasmo. We can then brainstorm alternatives or modifications to integrate a semantic DOM/sentence search without transformer.js. I’ll look for relevant details to inform our next steps.


The Prompt API lets Chrome extensions send natural‑language requests to an on‑device Gemini Nano model.  You create a `LanguageModel` session (after a user gesture and an availability check) and then call `session.prompt()` or `session.promptStreaming()` to obtain a result.  The API supports structured output via JSON schemas and multimodal input/output when you set `expectedInputs`/`expectedOutputs`.  Because Gemini Nano runs locally, Chrome imposes hardware and storage requirements (≈22 GB free space, 4 GB VRAM or 16 GB RAM) and downloads the model the first time it is used.  The model is also unavailable in WebWorkers and is still considered experimental.

### Designing a semantic DOM/sentence search

1. **Extract the page’s readable text.**
   Using the raw `document.body.innerText` often includes menus and ads.  Mozilla’s Readability library can extract the main article content; the Parsnip extension used a modified Readability API to return both text and the CSS selectors for each line.  You can embed this library into a Plasmo project or write a simple parser that prioritises `<article>`/`<main>` tags.

2. **Segment the text into sentences.**
   JavaScript’s `Intl.Segmenter` API is now part of the 2024 Baseline and can perform locale‑sensitive segmentation, yielding graphemes, words or **sentences**.  Example:

   ```js
   const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
   const sentences = [...segmenter.segment(article.textContent)]
       .map(seg => seg.segment.trim())
       .filter(s => s.length > 0);
   ```

   Keeping a mapping from each sentence to its DOM selector allows you to highlight the match later.

3. **Generate semantic embeddings (optional but recommended).**
   Sending an entire page and query to Gemini can quickly exceed the session’s input quota (you can monitor it via `session.inputUsage`/`session.inputQuota`).  A local embedding model lets you filter the candidate sentences.  Since the “Transformers.js Chrome extension” is still under development and not production‑ready, you might consider lighter alternatives:

   * `@tensorflow-models/universal-sentence-encoder` – runs in the browser using TensorFlow.js, yields 512‑dimensional sentence embeddings.  Parsnip used a modified TF.js sentence encoder for this purpose.
   * `@xenova/transformers` (Transformers.js v3) – supports WebGPU/Wasm back‑ends and includes sentence‑transformer models.  To reduce bundle size in Plasmo, load the model lazily in a service worker or offscreen document, and exclude any Node‑specific modules (e.g. `fs`) via the bundler configuration.
   * If embedding generation remains problematic, you can fall back to lexical pre‑filtering (e.g. search for the query terms) and only use the Prompt API for re‑ranking.

   Compute an embedding for the user’s query and each sentence, then compute cosine similarity to select the top *k* candidates.  Parsnip stored these vectors in `chrome.storage.session` and used cosine similarity to find the best matches.

4. **Ask Gemini Nano to pick the best sentence.**
   After selecting a handful of candidate sentences, call the Prompt API to identify which one answers the user’s question.  Example (simplified):

   ```js
   const session = await languageModel.create({
     expectedInputs: [{ type: "text", languages: ["en"] }],
     expectedOutputs: [{ type: "text", languages: ["en"] }]
   });

   // Build a JSON schema so the model returns {answer: string, index: integer}
   const responseSchema = {
     type: "object",
     properties: {
       answer: { type: "string" },
       index:  { type: "integer" }
     },
     required: ["answer","index"]
   };

   const systemMsg = {
     role: "system",
     content: "From the list of candidate sentences and the user question, " +
              "answer in <=20 words and return the index of the best sentence as JSON."
   };

   const userMsg = {
     role: "user",
     content: `Question: ${query}\n\nCandidates:\n${candidates
       .map((s,i) => `${i}: ${s}`)
       .join("\n")}`
   };

   const result = await session.prompt([systemMsg, userMsg], {
     responseConstraint: responseSchema
   });

   const { answer, index } = JSON.parse(result);
   ```

   This pattern mirrors what Parsnip did: they provided a list of candidates and instructed the model to return JSON containing the answer and the index.  With `responseConstraint`, Chrome enforces that the output matches the schema, avoiding fragile regex parsing.

5. **Highlight and read out the sentence.**
   Use the stored mapping of sentences to DOM selectors to locate the chosen sentence.  You can use the Web Speech API (`speechSynthesis.speak()`) to read it aloud.  Optionally, provide fallback text in case the model’s answer is empty.

### Handling Plasmo and bundler constraints

Plasmo uses the Parcel bundler and manifest‑v3.  Heavy ML models can trip up the bundler because they may include Node‑specific dependencies or large binary assets.  Strategies to improve compatibility include:

* **Load models in an offscreen document or service worker.**  Plasmo supports background scripts and offscreen documents, which can run heavy code without blocking the UI.  You can create a separate file (e.g. `ml.ts`) that dynamically imports the embedding model and exposes message‑based APIs.
* **Use dynamic import and external assets.**  Instead of bundling the entire model, copy the `.onnx` or `.json` weights into your extension’s assets directory and fetch them at runtime.  Configure Plasmo’s `plasmo.assets` field so the bundler doesn’t inline them.
* **Stick to TF.js or small models.**  Parsnip serialised a sentence‑encoder model into TF.js format and loaded it dynamically, avoiding Node dependencies.  This approach may be easier than running large Hugging Face models in a browser extension.
* **Wait for stable support.**  The Transformers.js Chrome example acknowledges that the project is still under development and not ready for production.  As the ecosystem matures, Plasmo may add first‑class support for ONNX/WebGPU models.

### Alternative approaches

If embedding generation proves too heavy, you can rely entirely on the Prompt API by chunking the page into smaller segments (e.g. paragraphs) and asking the model to answer the question using only those segments.  However, you must respect the session’s input quota.  For cross‑language queries, chain the **Language Detector API** to detect the page’s language and call the **Translator API** to translate either the query or the candidates before computing similarity.

By combining DOM extraction, sentence segmentation, lightweight embeddings for pre‑filtering, and Gemini’s reasoning via the Prompt API, you can build a fully local “semantic search & read aloud” feature without external API calls.
