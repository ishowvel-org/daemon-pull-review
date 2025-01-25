export const CODE_REVIEW_GROUND_TRUTHS_SYSTEM_MESSAGE = {
  example: [
    ` Task: Implement a function that adds two numbers.
        Ground Truths:
        - The function should accept two numerical inputs.
        - The function should return the sum of the two inputs.
        - Inputs must be validated to ensure they are numbers.`,
  ],
  truthRules: [
    "Be succinct and easy to understand.",
    "Directly pertain to the task at hand.",
    "Focus on essential requirements, behaviors, or assumptions involved in the task.",
  ],
  conditions: [],
};
