declare module '*.css';

interface GoogleIdCredentialResponse {
	credential: string;
	select_by?: string;
}

interface GoogleIdInitializeOptions {
	client_id: string;
	callback: (response: GoogleIdCredentialResponse) => void;
}

interface GoogleIdButtonOptions {
	type?: 'standard' | 'icon';
	theme?: 'outline' | 'filled_blue' | 'filled_black';
	size?: 'large' | 'medium' | 'small';
	text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
	shape?: 'rectangular' | 'pill' | 'circle' | 'square';
	width?: number;
	logo_alignment?: 'left' | 'center';
}

interface Window {
	google?: {
		accounts: {
			id: {
				initialize: (options: GoogleIdInitializeOptions) => void;
				renderButton: (parent: HTMLElement, options: GoogleIdButtonOptions) => void;
			};
		};
	};
}