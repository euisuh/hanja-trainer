export function tierForTgh(value: string | undefined): "一级字" | "二级字" | "三级字" {
  const match = /^2013:(\d+)$/u.exec(value ?? "");
  const position = Number.parseInt(match?.[1] ?? "", 10);
  if (position >= 1 && position <= 3500) return "一级字";
  if (position >= 3501 && position <= 6500) return "二级字";
  if (position >= 6501 && position <= 8105) return "三级字";
  throw new Error(`invalid kTGH position: ${value ?? "missing"}`);
}
