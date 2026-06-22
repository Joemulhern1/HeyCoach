export const metadata = {
  title: "HeyCoach",
  description: "Your AI cycling coach and nutritionist",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
