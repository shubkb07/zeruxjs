export declare const createDocumentSecurity: () => {
    nonce: string;
};

export declare const renderDocument: (options: {
    title: string;
    bodyClass?: string;
    content: string;
    payload: unknown;
    nonce?: string;
}) => string;

export declare const escapeHtml: (value: unknown) => string;
