#!/bin/bash

# Script to update your fork with latest changes from official Goose repo

echo "🔄 Updating fork with latest changes from Block/Goose..."

# Ensure we're in the right directory
cd "$(dirname "$0")"

# Fetch latest from official repo
echo "📥 Fetching latest changes from upstream..."
git fetch origin

# Check if we have uncommitted changes
if ! git diff-index --quiet HEAD --; then
    echo "⚠️  You have uncommitted changes. Please commit or stash them first."
    exit 1
fi

# Get current branch
CURRENT_BRANCH=$(git branch --show-current)
echo "📍 Currently on branch: $CURRENT_BRANCH"

# Update main branch
echo "🔄 Updating main branch..."
git checkout main
git pull origin main
git push fork main

# Update feature branch if it exists and we were on it
if [ "$CURRENT_BRANCH" != "main" ]; then
    echo "🔄 Updating feature branch: $CURRENT_BRANCH"
    git checkout "$CURRENT_BRANCH"
    
    # Ask user preference for merge vs rebase
    echo "How would you like to integrate changes?"
    echo "1) Merge (preserves branch history)"
    echo "2) Rebase (cleaner linear history)"
    read -p "Choose (1 or 2): " choice
    
    case $choice in
        1)
            echo "🔀 Merging main into $CURRENT_BRANCH..."
            git merge main
            ;;
        2)
            echo "📝 Rebasing $CURRENT_BRANCH onto main..."
            git rebase main
            ;;
        *)
            echo "❌ Invalid choice. Defaulting to merge..."
            git merge main
            ;;
    esac
    
    if [ $? -eq 0 ]; then
        echo "✅ Successfully updated $CURRENT_BRANCH"
        echo "🚀 Pushing to your fork..."
        git push fork "$CURRENT_BRANCH"
    else
        echo "❌ Conflicts detected. Please resolve them manually and then run:"
        echo "   git push fork $CURRENT_BRANCH"
        exit 1
    fi
fi

echo "✅ Update complete! Your fork is now in sync with the official repo."
echo "📊 Summary of new commits:"
git log --oneline HEAD~5..HEAD
