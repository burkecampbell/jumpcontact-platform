import clientsData from '../data/clients.json';

const clients = clientsData.clients as Record<string, string>;
const aliases = (clientsData as Record<string, unknown>).aliases as Record<string, string> | undefined;
const clientBrands = (clientsData as Record<string, unknown>).clientBrands as Record<string, string> | undefined;

export function resolveClient(phone: string): string {
  return clients[phone] || (aliases && aliases[phone] as string) || '';
}

export function isMscPhone(phone: string): boolean {
  const brands = (clientsData as Record<string, unknown>).brands as Record<string, string> | undefined;
  if (brands && brands[phone] === 'msc') return true;
  const name = (clients[phone] || '').toLowerCase();
  return name === 'msc' || name.includes('med spa');
}

export function isJCPhone(phone: string): boolean {
  return !isMscPhone(phone);
}

export function getClientBrand(clientName: string): 'jc' | 'msc' | null {
  if (!clientName) return null;
  if (clientBrands && clientBrands[clientName]) {
    return clientBrands[clientName] as 'jc' | 'msc';
  }
  if (clientBrands) {
    const lower = clientName.toLowerCase();
    for (const [name, brand] of Object.entries(clientBrands)) {
      if (name.toLowerCase() === lower) return brand as 'jc' | 'msc';
    }
  }
  return null;
}

export function isJCClient(clientName: string): boolean {
  return getClientBrand(clientName) === 'jc';
}

export function isMSCClient(clientName: string): boolean {
  return getClientBrand(clientName) === 'msc';
}
