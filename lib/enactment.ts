const dateFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "long",
  timeZone: "UTC",
});

export function enactmentDate(date: string) {
  return dateFormat.format(new Date(date));
}
