export const formatDateJa = (value: string) => {
  try {
    return new Date(value).toLocaleDateString('ja-JP');
  } catch {
    return '';
  }
};
