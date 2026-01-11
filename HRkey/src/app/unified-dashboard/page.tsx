"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { apiGet } from "@/lib/apiClient";
import RoleSwitcher from "./components/RoleSwitcher";
import EmployeeSection from "./components/EmployeeSection";
import EmployerSection from "./components/EmployerSection";

type Role = "employee" | "employer";

type UserRoles = {
  hasEmployeeRole: boolean;
  hasEmployerRole: boolean;
};

export default function UnifiedDashboard() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [currentRole, setCurrentRole] = useState<Role>("employee");
  const [userRoles, setUserRoles] = useState<UserRoles>({
    hasEmployeeRole: false,
    hasEmployerRole: false,
  });

  useEffect(() => {
    const initialize = async () => {
      try {
        setLoading(true);

        // Get authenticated user
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData?.user) {
          router.push("/test");
          return;
        }

        const user = userData.user;
        setUserId(user.id);
        setUserEmail(user.email || "");

        // Detect employee role: check if user has references or people record
        let hasEmployeeRole = false;
        try {
          const peopleCheck = await supabase
            .from("people")
            .select("id")
            .eq("user_id", user.id)
            .limit(1);

          if (peopleCheck.data && peopleCheck.data.length > 0) {
            hasEmployeeRole = true;
          } else {
            // Check if they have any references
            const refsCheck = await supabase
              .from("references")
              .select("id")
              .eq("owner_id", user.id)
              .limit(1);

            if (refsCheck.data && refsCheck.data.length > 0) {
              hasEmployeeRole = true;
            }
          }
        } catch (err) {
          console.error("Error checking employee role:", err);
        }

        // Detect employer role: check if user has a company
        let hasEmployerRole = false;
        try {
          const companiesResult = await apiGet<{ success: boolean; companies: any[] }>(
            "/api/companies/my"
          );
          if (companiesResult.success && companiesResult.companies?.length > 0) {
            hasEmployerRole = true;
          }
        } catch (err) {
          console.error("Error checking employer role:", err);
        }

        setUserRoles({
          hasEmployeeRole,
          hasEmployerRole,
        });

        // Set default role based on what they have
        if (hasEmployerRole && !hasEmployeeRole) {
          setCurrentRole("employer");
        } else {
          setCurrentRole("employee");
        }
      } catch (error) {
        console.error("Initialization error:", error);
      } finally {
        setLoading(false);
      }
    };

    initialize();
  }, [router]);

  const handleRoleChange = (role: Role) => {
    setCurrentRole(role);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/test");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
          <p className="text-gray-600">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  // If user has no roles, show onboarding
  if (!userRoles.hasEmployeeRole && !userRoles.hasEmployerRole) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto px-6 py-10">
          <div className="bg-white border border-gray-200 rounded-lg p-8 shadow-sm">
            <div className="text-center">
              <div className="text-6xl mb-4">👋</div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome to HRKey!</h1>
              <p className="text-gray-600 mb-8">
                Choose how you want to get started
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
                <div className="border border-gray-200 rounded-lg p-6 hover:border-indigo-500 hover:shadow-md transition-all">
                  <div className="text-4xl mb-3">👤</div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">I'm an Employee</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Collect and manage references from colleagues and supervisors
                  </p>
                  <button
                    onClick={() => setUserRoles({ ...userRoles, hasEmployeeRole: true })}
                    className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700"
                  >
                    Start as Employee
                  </button>
                </div>

                <div className="border border-gray-200 rounded-lg p-6 hover:border-indigo-500 hover:shadow-md transition-all">
                  <div className="text-4xl mb-3">🏢</div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">I'm an Employer</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Access candidate data and make informed hiring decisions
                  </p>
                  <button
                    onClick={() => router.push("/company/onboarding")}
                    className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700"
                  >
                    Create Company Profile
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">HRKey Dashboard</h1>
              <p className="text-sm text-gray-600 mt-1">
                Welcome back, <span className="font-medium">{userEmail}</span>
              </p>
            </div>
            <button
              onClick={handleSignOut}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Sign Out
            </button>
          </div>

          {/* Role Switcher (only shown if user has both roles) */}
          <RoleSwitcher
            currentRole={currentRole}
            onRoleChange={handleRoleChange}
            hasEmployeeRole={userRoles.hasEmployeeRole}
            hasEmployerRole={userRoles.hasEmployerRole}
          />
        </div>

        {/* Content based on current role */}
        {currentRole === "employee" && userRoles.hasEmployeeRole && (
          <EmployeeSection userId={userId} userEmail={userEmail} />
        )}

        {currentRole === "employer" && userRoles.hasEmployerRole && (
          <EmployerSection userId={userId} />
        )}

        {/* Fallback: Show prompt to create missing role */}
        {currentRole === "employee" && !userRoles.hasEmployeeRole && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-blue-900 mb-2">Employee Features</h3>
            <p className="text-blue-800 mb-4">
              Start using employee features by creating your first reference.
            </p>
            <button
              onClick={() => setUserRoles({ ...userRoles, hasEmployeeRole: true })}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
            >
              Get Started
            </button>
          </div>
        )}

        {currentRole === "employer" && !userRoles.hasEmployerRole && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-blue-900 mb-2">Employer Features</h3>
            <p className="text-blue-800 mb-4">
              Create a company profile to access employer features.
            </p>
            <button
              onClick={() => router.push("/company/onboarding")}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
            >
              Create Company Profile
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
