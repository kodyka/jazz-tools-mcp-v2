{
  description = "Development shell for jazz-tools-mcp-v2";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = { nixpkgs, ... }:
    let
      systems = [
        "aarch64-darwin"
        "x86_64-darwin"
        "aarch64-linux"
        "x86_64-linux"
      ];

      forAllSystems = nixpkgs.lib.genAttrs systems;
    in
    {
      devShells = forAllSystems (
        system:
        let
          pkgs = import nixpkgs { inherit system; };
        in
        {
          default = pkgs.mkShell {
            packages = with pkgs; [
              nodejs_22
              git
              curl
              cacert
            ];

            shellHook = ''
              echo "jazz-tools-mcp-v2 development shell"
              echo "Node: $(node --version)"
              echo "npm:  $(npm --version)"
              echo
              echo "Recommended local verification:"
              echo "  npm install --no-audit --no-fund"
              echo "  npm run check"
              echo "  npm test"
              echo "  npm run build"
            '';
          };
        }
      );
    };
}
