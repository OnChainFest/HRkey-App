import { redirect } from 'next/navigation';

export default function HomePage() {
  // Redirect to the WebDapp index.html
  redirect('/WebDapp/index.html');
}
