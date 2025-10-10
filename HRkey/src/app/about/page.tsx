export const metadata = {
  title: "About · HRKey",
  description: "Qué es HRKey y cómo funciona.",
};

export default function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-3xl font-semibold mb-4">About</h1>
      <p className="text-slate-700">
        HRKey es una app de referencias verificadas. Este sitio corre en Base
        Sepolia para pruebas.
      </p>

      <ul className="list-disc pl-5 mt-4 space-y-2 text-slate-700">
        <li>
          Contrato: <code>{process.env.NEXT_PUBLIC_CONTRACT_ADDRESS}</code>
        </li>
        <li>Red: Base Sepolia (chainId 84532)</li>
      </ul>
    </div>
  );
}
