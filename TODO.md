# Skill Tree Implementation TODO

## 1. Define Skill Data Structure
- Add skill tree data with unique skills per character
- Common skills: speed, defense, point multiplier
- Each skill has levels, costs (points/V-Bucks), descriptions

## 2. Update Progress Saving/Loading
- Add characterSkills to saveProgress/loadProgress functions
- Include in Firestore save/load

## 3. Add Skill Tree Button to Character Select
- Add "Skill Tree" button in top left of drawCharSelect()

## 4. Implement Skill Tree Scene
- Add 'skillTree' scene
- Create drawSkillTree() function to show character grid
- Handle character clicks to go to upgrade screen

## 5. Implement Skill Upgrade Screen
- Create drawSkillUpgrades(charIndex) function
- Show skill branches with current levels, costs, upgrade buttons
- Handle upgrade purchases

## 6. Modify Player Class
- Apply skill bonuses (speed multiplier, etc.)
- Update player creation to use skills

## 7. Add Navigation
- Back buttons between scenes
- Update handleUIButton for new scenes

## 8. Testing
- Test navigation and upgrades
- Verify skills apply in gameplay
- Check progress persistence
