import { render, screen } from "@testing-library/react-native";

import App from "../App";

test("renders", async () => {
  await render(<App />);
  expect(screen.getByText("Hello")).toBeTruthy();
});
