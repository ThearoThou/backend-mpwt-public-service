export const CAMBODIAN_CAPITAL_PROVINCES_KH = [
  'ភ្នំពេញ',
  'បន្ទាយមានជ័យ',
  'បាត់ដំបង',
  'កំពង់ចាម',
  'កំពង់ឆ្នាំង',
  'កំពង់ស្ពឺ',
  'កំពង់ធំ',
  'កំពត',
  'កណ្ដាល',
  'កែប',
  'កោះកុង',
  'ក្រចេះ',
  'មណ្ឌលគិរី',
  'ឧត្តរមានជ័យ',
  'ប៉ៃលិន',
  'ព្រះសីហនុ',
  'ព្រះវិហារ',
  'ព្រៃវែង',
  'ពោធិ៍សាត់',
  'រតនគិរី',
  'សៀមរាប',
  'ស្ទឹងត្រែង',
  'ស្វាយរៀង',
  'តាកែវ',
  'ត្បូងឃ្មុំ',
] as const;

export const CAMBODIAN_PLATE_DISPLAY_LABEL_KH = 'កម្ពុជា';

export function isCambodianCapitalProvinceKh(value: string): boolean {
  return (CAMBODIAN_CAPITAL_PROVINCES_KH as readonly string[]).includes(value);
}
