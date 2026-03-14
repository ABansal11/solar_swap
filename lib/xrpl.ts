import { Client } from 'xrpl';

let client: Client | null = null;

export async function getClient(): Promise<Client> {
  if (!client || !client.isConnected()) {
    client = new Client('wss://s.altnet.rippletest.net:51233/');
    await client.connect();
  }
  return client;
}

export async function disconnectClient(): Promise<void> {
  if (client && client.isConnected()) {
    await client.disconnect();
    client = null;
  }
}
