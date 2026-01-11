"use client";

type Role = "employee" | "employer";

interface RoleSwitcherProps {
  currentRole: Role;
  onRoleChange: (role: Role) => void;
  hasEmployeeRole: boolean;
  hasEmployerRole: boolean;
}

export default function RoleSwitcher({
  currentRole,
  onRoleChange,
  hasEmployeeRole,
  hasEmployerRole,
}: RoleSwitcherProps) {
  // Si solo tiene un rol, no mostrar switcher
  if (!hasEmployeeRole || !hasEmployerRole) {
    return null;
  }

  return (
    <div className="border-b border-gray-200 mb-6">
      <nav className="-mb-px flex space-x-8" aria-label="Role tabs">
        <button
          onClick={() => onRoleChange("employee")}
          className={`
            whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors
            ${
              currentRole === "employee"
                ? "border-indigo-500 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }
          `}
          aria-current={currentRole === "employee" ? "page" : undefined}
        >
          <span className="inline-flex items-center gap-2">
            <span className="text-lg">👤</span>
            <span>Employee</span>
          </span>
        </button>

        <button
          onClick={() => onRoleChange("employer")}
          className={`
            whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors
            ${
              currentRole === "employer"
                ? "border-indigo-500 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }
          `}
          aria-current={currentRole === "employer" ? "page" : undefined}
        >
          <span className="inline-flex items-center gap-2">
            <span className="text-lg">🏢</span>
            <span>Employer</span>
          </span>
        </button>
      </nav>
    </div>
  );
}
