import { expect, type Locator } from '@playwright/test';

export async function selectDropdown(control: Locator, value: string) {
  const combobox = control.and(control.page().getByRole('combobox'));
  await combobox.click();
  await expect(combobox).toHaveAttribute('aria-expanded', 'true');
  const popupId = await combobox.getAttribute('aria-controls');
  if (!popupId) throw new Error('O seletor aberto não identifica seu painel de opções.');
  await combobox
    .page()
    .locator(`[id=${JSON.stringify(popupId)}] [role="option"][data-value=${JSON.stringify(value)}]`)
    .click();
  await expect(combobox).toHaveAttribute('data-value', value);
}
