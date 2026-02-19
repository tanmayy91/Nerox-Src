import moment from "moment";
import format from "moment-duration-format";
format(moment);
export const progressBar = (current, total, size = 20) => {
  const completedMarker = "━";
  const remainingMarker = "┄";
  const currentPositionMarker = "〇";
  const formatDuration = (duration) =>
    moment.duration(duration, "milliseconds").format("m[:]s[:]", 0, {
      trim: false,
    });
  if (current >= total) {
    return `${formatDuration(current)} \`${completedMarker.repeat(size - 1)}${currentPositionMarker}\` ${formatDuration(total)}`;
  }
  const progress = Math.round((size - 1) * (current / total));
  const remaining = size - 1 - progress;
  const bar = `${formatDuration(current)} \`${completedMarker.repeat(progress)}${currentPositionMarker}${remainingMarker.repeat(remaining)}\` ${formatDuration(total)}`;
  return bar;
};
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
