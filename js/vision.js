// Reconnaissance d'un repas en photo via l'API Claude (clé fournie par l'utilisateur).
// La clé reste dans le navigateur et n'est envoyée qu'à api.anthropic.com.

const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk/+esm';
const MAX_SIDE_PX = 1280;
const JPEG_QUALITY = 0.82;

const SYSTEM_PROMPT = `Tu es un diététicien qui analyse la photo d'un repas pour une application française de suivi nutritionnel.
Identifie chaque aliment visible séparément (ex. « steak haché », « frites », « salade verte », « sauce vinaigrette »), y compris les sauces, boissons et matières grasses visibles.
Estime la masse de chaque aliment en grammes (ou ml pour un liquide) d'après la taille de l'assiette, des couverts et des contenants.
Pour "ciqual_query", donne 2 à 4 mots-clés en français proches des libellés de la table Ciqual de l'ANSES (ex. « pomme de terre frite », « boeuf steak hache cuit », « riz blanc cuit »).
Donne aussi tes propres valeurs pour 100 g, utilisées si la table ne contient pas l'aliment.
Si la photo ne montre pas de nourriture, renvoie une liste vide et explique pourquoi dans "note".`;

const ITEM_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', description: "Nom court de l'aliment en français" },
    ciqual_query: { type: 'string' },
    grams: { type: 'number' },
    confidence: { type: 'string', enum: ['haute', 'moyenne', 'faible'] },
    kcal_100g: { type: 'number' },
    protein_100g: { type: 'number' },
    carbs_100g: { type: 'number' },
    fat_100g: { type: 'number' },
  },
  required: ['name', 'ciqual_query', 'grams', 'confidence', 'kcal_100g', 'protein_100g', 'carbs_100g', 'fat_100g'],
  additionalProperties: false,
};

const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    meal_name: { type: 'string', description: 'Nom du plat en quelques mots' },
    items: { type: 'array', items: ITEM_SCHEMA },
    note: { type: 'string', description: 'Remarque courte (incertitude, élément caché…)' },
  },
  required: ['meal_name', 'items', 'note'],
  additionalProperties: false,
};

/** Redimensionne la photo (moins de données envoyées, réponse plus rapide). */
export async function prepareImage(file) {
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, MAX_SIDE_PX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * ratio);
  canvas.height = Math.round(bitmap.height * ratio);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  return { dataUrl, base64: dataUrl.split(',')[1] };
}

let clientCache = { key: null, client: null };

async function getClient(apiKey) {
  if (clientCache.key === apiKey) return clientCache.client;
  const { default: Anthropic } = await import(SDK_URL);
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 });
  clientCache = { key: apiKey, client };
  return client;
}

/** Analyse la photo. Renvoie { meal_name, items: [...], note } ou lève une erreur lisible. */
export async function analyzeMealPhoto({ base64, apiKey, model, hint }) {
  if (!apiKey) throw new Error("Ajoute ta clé d'API Claude dans Profil → Reconnaissance photo.");
  const client = await getClient(apiKey);
  let response;
  try {
    response = await client.beta.messages.create({
      model,
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: RESULT_SCHEMA } },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
            { type: 'text', text: hint ? `Précision de l'utilisateur : ${hint}` : 'Analyse ce repas.' },
          ],
        },
      ],
    });
  } catch (err) {
    throw new Error(explainApiError(err));
  }
  if (response.stop_reason === 'refusal') throw new Error("L'IA n'a pas pu analyser cette image.");
  if (response.stop_reason === 'max_tokens') throw new Error('Réponse incomplète, réessaie avec une photo plus simple.');
  const text = response.content.find((b) => b.type === 'text')?.text;
  if (!text) throw new Error("Réponse vide de l'IA.");
  const parsed = JSON.parse(text);
  return {
    ...parsed,
    items: parsed.items.filter((i) => i.grams > 0 && i.kcal_100g >= 0),
  };
}

function explainApiError(err) {
  const status = err?.status;
  if (status === 401) return "Clé d'API refusée : vérifie-la dans Profil.";
  if (status === 403) return "Cette clé n'a pas accès au modèle choisi.";
  if (status === 429) return "Trop de demandes d'un coup : réessaie dans une minute.";
  if (status === 400 && /credit|billing/i.test(err?.message ?? '')) return 'Crédit API épuisé sur ton compte Anthropic.';
  if (status >= 500) return 'Le service Claude est momentanément indisponible.';
  if (!navigator.onLine) return 'Pas de connexion internet.';
  return `Analyse impossible : ${err?.message ?? 'erreur inconnue'}`;
}
