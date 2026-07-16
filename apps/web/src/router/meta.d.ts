import "vue-router";

export {};

declare module "vue-router" {
  interface RouteMeta {
    title?: string;
    identityOnly?: boolean;
    requiresIdentity?: boolean;
    transitionKey?: string;
  }
}
