import { MockGenerationProvider } from "./providers/mock-provider";
import type { GenerationProviderAdapter, ProviderSelectionInput } from "./types";

export class ProviderRegistry {
  private readonly providers = new Map<string, GenerationProviderAdapter>();

  constructor(initialProviders: GenerationProviderAdapter[] = []) {
    initialProviders.forEach((provider) => this.register(provider));
  }

  register(provider: GenerationProviderAdapter) {
    this.providers.set(provider.providerKey, provider);
  }

  get(providerKey: string) {
    return this.providers.get(providerKey) ?? null;
  }

  list() {
    return Array.from(this.providers.values());
  }

  select(input: ProviderSelectionInput) {
    if (input.preferredProviderKey) {
      const preferredProvider = this.get(input.preferredProviderKey);

      if (preferredProvider?.supports(input.outputType)) {
        return preferredProvider;
      }
    }

    return this.list().find((provider) => provider.supports(input.outputType)) ?? null;
  }
}

export const defaultProviderRegistry = new ProviderRegistry([MockGenerationProvider]);
