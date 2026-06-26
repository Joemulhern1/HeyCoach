import { readStore, patchStore } from "../../../lib/store.js";
import { dailyTargets } from "../../../lib/nutrition.js";
import { generateMeals } from "../../../lib/meals.js";

export const maxDuration = 60;

export async function GET() {
  const store = await readStore();
  return Response.json({ plan: store.nutritionPlan || null });
}

export async function POST() {
  const store = await readStore();
  if (!store.profile) return Response.json({ error: "Set up your goal first." }, { status: 400 });
  try {
    const targets = dailyTargets(store.profile, store.weights || []);
    const meals = await generateMeals(targets);
    const plan = { meals, generatedAt: new Date().toISOString() };
    const saved = await patchStore({ nutritionPlan: plan });
    return Response.json({ plan: saved.nutritionPlan });
  } catch (e) {
    return Response.json({ error: e.message || "Couldn't generate meals." }, { status: 500 });
  }
}
