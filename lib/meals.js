import { ask } from "./anthropic.js";
import { extractJson } from "./coach.js";

// Generate a full day of family-friendly meals + quick recipes for a training day and a rest
// day, hitting the given macro targets, using everyday Lidl-Ireland ingredients.
export async function generateMeals(targets) {
  const t = (d) => `${d.kcal} kcal, ${d.carbsG}g carbs, ${d.proteinG}g protein, ${d.fatG}g fat`;
  const prompt = `You are a sports nutritionist and a practical home cook. Create simple, family-friendly meal ideas for a cyclist that the whole family will eat, using everyday ingredients that are easy to buy at Lidl in Ireland and are budget-friendly. Real, quick home cooking — nothing fancy or hard to source.

Plan a full day of meals for TWO day types:
- "trainingDay" should total roughly: ${t(targets.hard)} (carb-forward to fuel training)
- "restDay" should total roughly: ${t(targets.rest)} (lighter, higher protein, fewer carbs)

For each day give: breakfast, lunch, dinner, and one snack. For each meal include exactly:
- "name": short dish name
- "ingredients": array of 3–7 simple items (things stocked at Lidl Ireland)
- "method": 2–3 short steps, one string
- "kcal", "carbsG", "proteinG", "fatG": approximate numbers per serving

Favour common Irish staples: porridge oats, eggs, chicken, beef/turkey mince, potatoes, pasta, rice, tinned tomatoes/beans, frozen veg & berries, Greek/natural yoghurt, bananas, wholemeal bread, cheese, milk. Keep methods quick and kid-friendly. Portions are for one adult athlete (the family scales up).

Return ONLY valid JSON, no prose, in this exact shape:
{"trainingDay":{"breakfast":{...},"lunch":{...},"dinner":{...},"snack":{...}},"restDay":{"breakfast":{...},"lunch":{...},"dinner":{...},"snack":{...}}}`;
  const raw = await ask(prompt, 3500);
  return extractJson(raw);
}
