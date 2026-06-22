import { Encoder, Profile } from "@garmin/fitsdk";

const INTENSITY = { warmup: "warmup", cooldown: "cooldown", rest: "rest", recovery: "recovery", active: "active" };

// Build a Garmin-compatible structured WORKOUT .fit from a ride day's steps.
// Power targets use the FIT convention: encoded value = watts + 1000.
export function buildWorkoutFit(day, ftp) {
  const steps = (day.steps || []).filter((s) => s && s.durationSec > 0);
  if (!steps.length) throw new Error("This day has no structured steps to export.");

  const enc = new Encoder();
  const name = (`${day.day} ${day.title}` || "Workout").slice(0, 30);

  enc.writeMesg({ mesgNum: Profile.MesgNum.FILE_ID, type: "workout", manufacturer: "development", product: 0, timeCreated: new Date(), serialNumber: 1111 });
  enc.writeMesg({ mesgNum: Profile.MesgNum.WORKOUT, wktName: name, sport: "cycling", subSport: "generic", numValidSteps: steps.length });

  steps.forEach((s, i) => {
    const low = s.powerLowPct ? Math.round((ftp * s.powerLowPct) / 100) + 1000 : null;
    const high = s.powerHighPct ? Math.round((ftp * s.powerHighPct) / 100) + 1000 : null;
    const mesg = {
      mesgNum: Profile.MesgNum.WORKOUT_STEP,
      messageIndex: i,
      wktStepName: (s.name || `Step ${i + 1}`).slice(0, 30),
      durationType: "time",
      durationValue: Math.round(s.durationSec * 1000),
      intensity: INTENSITY[s.intensity] || "active",
    };
    if (low && high) {
      mesg.targetType = "power"; mesg.targetValue = 0;
      mesg.customTargetValueLow = low; mesg.customTargetValueHigh = high;
    } else {
      mesg.targetType = "open";
    }
    enc.writeMesg(mesg);
  });

  return Buffer.from(enc.close());
}

export function workoutFilename(day) {
  const safe = `${day.day}-${day.title}`.replace(/[^a-z0-9]+/gi, "_").slice(0, 40);
  return `${safe || "workout"}.fit`;
}
