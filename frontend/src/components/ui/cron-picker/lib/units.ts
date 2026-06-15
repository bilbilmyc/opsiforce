import type { Unit } from './types';

export const units: Unit[] = [
  { name: 'minute', min: 0, max: 59 },
  { name: 'hour', min: 0, max: 23 },
  { name: 'day', min: 1, max: 31 },
  {
    name: 'month',
    min: 1,
    max: 12,
    alt: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  },
  {
    name: 'weekday',
    min: 0,
    max: 6,
    alt: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  },
];

export const spreadOption = (option: Unit) => {
  const spreadArr: string[] = [];
  for (let i = option.min; i <= option.max; i++) {
    spreadArr.push(String(i));
  }
  return spreadArr;
};

export function getUnits() {
  return units;
}
