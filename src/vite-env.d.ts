/// <reference types="vite/client" />

declare namespace JSX {
  interface IntrinsicElements {
    'stripe-pricing-table': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
      'pricing-table-id': string;
      'publishable-key': string;
      'client-reference-id'?: string;
    }, HTMLElement>;
  }
}