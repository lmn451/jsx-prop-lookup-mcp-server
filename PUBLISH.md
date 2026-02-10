# Publishing Guide

## Git Repository Setup

1. **Create GitHub repository:**

   ```bash
   # Go to GitHub and create a new repository named: jsx-prop-lookup-mcp-server
   ```

2. **Add remote and push:**
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/jsx-prop-lookup-mcp-server.git
   git branch -M main
   git push -u origin main
   ```

## NPM Publishing

1. **Login to NPM:**

   ```bash
   npm login
   ```

2. **Update package.json with your GitHub username:**
   - Replace `your-username` in the repository URLs with your actual GitHub username

3. **Publish to NPM:**
   ```bash
   npm publish
   ```

## MCP Registry (Optional)

Consider submitting to the MCP server registry once it's available.

## Post-Publishing

1. **Update README with installation instructions:**

   ```bash
   npm install -g jsx-prop-lookup-mcp-server
   ```

2. **Create GitHub release:**
   - Tag version v1.0.0
   - Include release notes

## Current Status

✅ Code committed to git
✅ Built successfully
✅ Ready for publishing

**Next steps:** Update GitHub username in package.json and push to your repository!
