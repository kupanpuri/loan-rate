import { UPDATE_TIMES_SAO_PAULO } from "./config";

export function nextSuggestedUpdates(now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  const today = formatter.format(now);
  return UPDATE_TIMES_SAO_PAULO.map((time) => `${today} ${time} America/Sao_Paulo`);
}
