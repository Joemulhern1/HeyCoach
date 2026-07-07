// Deterministic daily nutrition targets — instant, no model. Macros are periodised by the
// day's training load: fuel hard/long days, hold a deficit on easy/rest days toward the
// weight goal. Protein and fat are set per kg of bodyweight; carbohydrate fills the remainder.

const FLOOR = 1500;

export function latestWeightKg(weights, profile) {
  if (weights && weights.length) return weights[weights.length - 1].kg;
  return profile?.currentWeightKg || 75;
}

export function dailyTargets(profile, weights) {
  const w = latestWeightKg(weights, profile);
  const maint = w * 32; // rough active TDEE
  const losing = (profile?.targetWeightKg || w) < w - 0.5;
  const proteinG = Math.round(w * 2);
  const fatG = Math.round(w * 1);
  const mk = (kcal) => {
    kcal = Math.max(FLOOR, Math.round(kcal / 10) * 10);
    const carbsG = Math.max(0, Math.round((kcal - proteinG * 4 - fatG * 9) / 4));
    return { kcal, carbsG, proteinG, fatG };
  };
  return {
    hard: mk(maint + 200),
    moderate: mk(maint),
    easy: mk(maint - (losing ? 300 : 150)),
    rest: mk(maint - (losing ? 500 : 250)),
  };
}

function durMin(s) { if (!s) return 0; const h = /(\d+)h/.exec(s); const m = /h(\d+)/.exec(s) || /(\d+)min/.exec(s); return (h ? +h[1] * 60 : 0) + (m ? +m[1] : 0); }

export function classifyDay(day) {
  if (!day) return "rest";
  if (day.type === "rest" || day.status === "off") return "rest";
  if (day.type === "gym") return "easy";
  const i = day.intensity;
  if (["vo2", "threshold", "anaerobic", "sprint"].includes(i)) return "hard";
  if (i === "endurance") return durMin(day.duration) >= 150 ? "hard" : "moderate";
  if (i === "tempo") return "moderate";
  if (i === "recovery") return "easy";
  return "moderate";
}

export const DAYTYPE_LABEL = { hard: "Hard / long day", moderate: "Moderate day", easy: "Easy day", rest: "Rest day" };

export function dailyAdvice(dayType, tsb, sessionTitle) {
  const s = sessionTitle || "your session";
  const fatigued = tsb != null && tsb <= -30;
  const fresh = tsb != null && tsb > 8;
  const form = tsb == null ? "" : ` Your form is ${tsb > 0 ? "+" : ""}${tsb}.`;
  if (dayType === "rest") {
    return `Rest day — this is where training turns into fitness.${form} Keep off the bike, hit your protein, and sleep well.` + (fatigued ? " You're deep in fatigue, so genuinely rest — no sneaky spin." : "");
  }
  if (dayType === "hard") {
    if (fatigued) return `Big one today — ${s} — but you're carrying real fatigue.${form} If the legs feel flat in the first efforts, cut it short or swap for easy endurance. Quality beats grinding.`;
    if (fresh) return `You're fresh and ready.${form} A great day to nail ${s} — fuel up well and commit to the intervals.`;
    return `Today's a key session: ${s}.${form} Fuel properly, warm up fully, and hold the target watts on every rep.`;
  }
  if (dayType === "easy") return `Keep today genuinely easy (${s}) — it lets the hard work stick.${form} Resist the urge to push.`;
  return `A steady day: ${s}.${form} Hold the prescribed zones — controlled, not heroic.`;
}

export function fuelling(dayType) {
  if (dayType === "hard") return {
    carbsPerHour: "60–90g / hour",
    pre: "3–4h before: carb-rich meal (porridge + banana, or toast + eggs). 30–60 min before: a banana.",
    during: "On anything over ~75 min, take 60–90g carbs/hour — drink mix, gels, a banana or flapjack.",
    post: "Within 30–60 min: ~25–30g protein + carbs — Greek yoghurt + fruit + granola, or chocolate milk.",
  };
  if (dayType === "moderate") return {
    carbsPerHour: "30–60g / hour",
    pre: "A normal meal 2–3h before, or a banana 30 min out.",
    during: "30–60g carbs/hour if you're out over 90 min; water otherwise.",
    post: "A balanced meal within ~2h — protein + carbs + veg.",
  };
  return {
    carbsPerHour: "Minimal",
    pre: "No special fuelling — eat normally.",
    during: "Water; only add food if you're out over 2h.",
    post: "A normal balanced meal.",
  };
}
