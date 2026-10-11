// Pure session-data -> view-model mapping for the weather pages (SPEC 8.3); no DOM, so node tests can import it.

// ovos-skill-weather's animated weatherCode switch, copied from
// ~/.cache/ovos_gui/ovos-skill-weather.openvoiceos/qt5/WeatherDelegate.qml getWeatherAnimation().
const ANIMATED_ICONS = [
  "sun", // 0 clear day
  "night", // 1 clear night
  "partial_clouds", // 2 few clouds day
  "partial_clouds", // 3 few clouds night
  "clouds", // 4 scattered clouds day
  "clouds", // 5 scattered clouds night
  "partial_clouds", // 6 broken clouds day
  "partial_clouds", // 7 broken clouds night
  "rain", // 8 shower rain day
  "rain", // 9 shower rain night
  "rain", // 10 rain day
  "rain", // 11 rain night
  "storm", // 12 thunderstorm day
  "storm", // 13 thunderstorm night
  "snow", // 14 snow day
  "snow", // 15 snow night
  "fog", // 16 mist day
  "fog", // 17 mist night
];
const UNKNOWN_ICON = "clouds";
const DAILY_KEY = "forecast";
const HOURLY_KEY = "hourlyForecast";
const MISSING = "–";

export function animatedIconName(code) {
  if (code === null || code === undefined || code === "") return UNKNOWN_ICON;
  return ANIMATED_ICONS[Number(code)] ?? UNKNOWN_ICON;
}

export function iconUrl(name) {
  return `/static/icons/${name}.svg`;
}

function isBlank(value) {
  return value === null || value === undefined || value === "";
}

export function degrees(value) {
  return isBlank(value) || Number.isNaN(Number(value)) ? MISSING : `${Math.round(Number(value))}°`;
}

export function percent(value) {
  return isBlank(value) || Number.isNaN(Number(value)) ? MISSING : `${Math.round(Number(value))}%`;
}

function details(data, withHumidity) {
  const parts = [];
  if (withHumidity && !isBlank(data.humidity)) parts.push(`humidity ${percent(data.humidity)}`);
  if (!isBlank(data.windSpeed)) parts.push(`wind ${Math.round(Number(data.windSpeed))}`);
  return parts.join(" · ");
}

function nowChips(single, data) {
  const low = { value: degrees(data.lowTemperature), label: "low" };
  const rain = { value: percent(data.chanceOfPrecipitation), label: "rain" };
  if (single) return [low, rain, { value: percent(data.humidity), label: "humidity" }];
  return [{ value: degrees(data.highTemperature), label: "high" }, low, rain];
}

/** CurrentWeather (big = now) and SingleDay (big = the day's high): one big circle plus three chips. */
export function nowModel(page, data) {
  const single = page === "SingleDay";
  return {
    heading: single ? (data.weatherDate ?? "") : (data.currentTimezone ?? ""),
    location: data.weatherLocation ?? "",
    icon: animatedIconName(data.weatherCode),
    big: degrees(single ? data.highTemperature : data.currentTemperature),
    chips: nowChips(single, data),
    details: details(data, !single),
  };
}

function dailyItem(day) {
  return {
    label: day.date ?? "",
    icon: animatedIconName(day.weatherCondition),
    main: degrees(day.highTemperature),
    sub: degrees(day.lowTemperature),
  };
}

function hourlyItem(hour) {
  return {
    label: hour.time ?? "",
    icon: animatedIconName(hour.weatherCondition),
    main: degrees(hour.temperature),
    sub: percent(hour.precipitation),
  };
}

/** DailyForecast reads forecast.all[], HourlyForecast reads hourlyForecast.hours[] (skill __init__.py builders). */
export function forecastModel(page, data) {
  const hourly = page === "HourlyForecast";
  const items = hourly ? (data[HOURLY_KEY]?.hours ?? []) : (data[DAILY_KEY]?.all ?? []);
  return {
    heading: hourly ? (data.currentTimezone ?? "") : "",
    location: data.weatherLocation ?? "",
    items: items.map(hourly ? hourlyItem : dailyItem),
  };
}

export function sunTimesModel(data) {
  return {
    heading: data.currentTimezone ?? "",
    location: data.weatherLocation ?? "",
    sunrise: data.sunrise ?? MISSING,
    sunset: data.sunset ?? MISSING,
  };
}
