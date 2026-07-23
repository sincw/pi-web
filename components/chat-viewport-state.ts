export function isAtScrollTail(scrollHeight: number, scrollTop: number, clientHeight: number): boolean {
  return scrollHeight - scrollTop - clientHeight <= 1;
}

export function getCompletionScrollAllowed({
  current,
  atTail,
  now,
  ignoreProgrammaticScrollUntil,
  userScrollIntentUntil,
}: {
  current: boolean;
  atTail: boolean;
  now: number;
  ignoreProgrammaticScrollUntil: number;
  userScrollIntentUntil: number;
}): boolean {
  if (atTail) return true;
  if (now < ignoreProgrammaticScrollUntil || now > userScrollIntentUntil) return current;
  return false;
}
